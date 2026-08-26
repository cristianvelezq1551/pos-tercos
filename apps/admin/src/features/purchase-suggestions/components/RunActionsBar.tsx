'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import { evaluateAllPending, runScan, sendSuggestionsSummary } from '../api';
import { getErrorMessage } from '../../../lib/errors';

type Tone = 'ok' | 'warn' | 'error';
interface Feedback {
  tone: Tone;
  text: string;
}

/**
 * Acciones de la pantalla de sugerencias:
 *  - Revisar ahora (corre el detector, además del automático cada hora).
 *  - Enviar el resumen abierto por WhatsApp.
 *  - Evaluar las pendientes con IA (cuesta plata por cada una).
 *
 * El mensaje de resultado va ACOTADO en ancho y debajo de los botones: esta
 * columna del encabezado no se encoge, así que un texto largo suelto acá le
 * come el espacio al título y lo parte letra por letra.
 */
export function RunActionsBar() {
  const router = useRouter();
  const [pending, setPending] = useState<'scan' | 'eval' | 'summary' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  /** Toda acción arranca en limpio: mezclar el resultado de una con el error
   *  de otra deja la pantalla diciendo dos cosas a la vez. */
  async function run(
    kind: 'scan' | 'eval' | 'summary',
    action: () => Promise<Feedback>,
  ) {
    setPending(kind);
    setFeedback(null);
    try {
      setFeedback(await action());
    } catch (e) {
      setFeedback({ tone: 'error', text: getErrorMessage(e, 'No se pudo completar.') });
    }
    setPending(null);
  }

  const handleScan = () =>
    run('scan', async () => {
      const r = await runScan();
      if (r.skipped) {
        return {
          tone: 'warn',
          text: 'El sistema ya está revisando en este momento. Espera un minuto y vuelve a mirar el listado.',
        };
      }
      const parts = [
        `${r.scannedCount} insumos y productos revisados`,
        `${r.createdCount} sugerencias nuevas`,
      ];
      if (r.staledCount > 0) parts.push(`${r.staledCount} ya no hacen falta`);
      router.refresh();
      if (r.failedCount > 0) {
        return {
          tone: 'warn',
          text: `${parts.join(' · ')}. ${r.failedCount} no se pudieron registrar; revisa con el dueño.`,
        };
      }
      return { tone: 'ok', text: parts.join(' · ') };
    });

  const handleEvalAll = () =>
    run('eval', async () => {
      const r = await evaluateAllPending();
      router.refresh();
      if (r.failed > 0) {
        // El motivo viene del servidor: "3 fallaron" a secas no le dice a
        // nadie si es la llave, el saldo o la conexión.
        const motivo = r.errors.length > 0 ? ` ${r.errors.join(' ')}` : '';
        return {
          tone: r.evaluated > 0 ? 'warn' : 'error',
          text: `${r.evaluated} evaluadas · ${r.failed} sin evaluar.${motivo}`,
        };
      }
      if (r.evaluated === 0) {
        return { tone: 'ok', text: 'No hay sugerencias pendientes de evaluar.' };
      }
      return { tone: 'ok', text: `${r.evaluated} evaluadas con IA.` };
    });

  const handleSendSummary = () =>
    run('summary', async () => {
      const r = await sendSuggestionsSummary();
      if (r.recipients.length === 0) {
        // Puede ser que no haya nada que enviar, o que no haya a QUIÉN: el
        // servidor distingue los dos casos en el texto de la vista previa.
        return {
          tone: r.preview.includes('No hay sugerencias') ? 'ok' : 'warn',
          text: r.preview.includes('No hay sugerencias')
            ? 'No hay sugerencias abiertas — nada que enviar.'
            : 'Hay sugerencias abiertas, pero no hay a quién avisarle: ningún dueño ni administrador activo tiene teléfono cargado.',
        };
      }
      if (r.sent === 0) {
        const sinTelefono = r.recipients.filter((x) => x.status === 'skipped').length;
        return {
          tone: 'warn',
          text:
            sinTelefono === r.recipients.length
              ? 'No se envió nada: no hay WhatsApp conectado o nadie tiene teléfono cargado.'
              : `No se pudo enviar a ninguno de los ${r.recipients.length} destinatarios.`,
        };
      }
      const extra: string[] = [];
      const fallaron = r.failed;
      const saltados = r.recipients.filter((x) => x.status === 'skipped').length;
      if (fallaron > 0) extra.push(`${fallaron} fallaron`);
      if (saltados > 0) extra.push(`${saltados} sin teléfono`);
      return {
        tone: fallaron > 0 ? 'warn' : 'ok',
        text: `Enviado a ${r.sent} ${r.sent === 1 ? 'persona' : 'personas'}${
          extra.length > 0 ? ` · ${extra.join(' · ')}` : ''
        }`,
      };
    });

  const toneClass: Record<Tone, string> = {
    ok: 'text-success',
    warn: 'text-warning',
    error: 'text-destructive',
  };

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="sm" variant="ghost" onClick={handleScan} disabled={pending !== null}>
          {pending === 'scan' ? 'Revisando…' : 'Revisar ahora'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSendSummary}
          disabled={pending !== null}
          title="Manda un WhatsApp con todas las sugerencias abiertas al dueño y a los administradores."
        >
          {pending === 'summary' ? 'Enviando…' : 'Enviar resumen por WhatsApp'}
        </Button>
        <Button size="sm" onClick={handleEvalAll} disabled={pending !== null}>
          {pending === 'eval' ? 'Evaluando…' : 'Evaluar pendientes (IA)'}
        </Button>
      </div>
      {feedback ? (
        <p
          role="status"
          className={`max-w-xs break-words text-xs leading-relaxed sm:text-right ${toneClass[feedback.tone]}`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
