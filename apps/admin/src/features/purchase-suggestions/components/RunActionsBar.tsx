'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import { evaluateAllPending, runScan, sendSuggestionsSummary } from '../api';

/**
 * Barra de acciones admin para sugerencias:
 *  - Scan manual (corre detector ahora, además del cron horario).
 *  - Evaluar todas las PENDING (LLM batch). Cuesta $$ — solo Dueño.
 */
export function RunActionsBar() {
  const router = useRouter();
  const [pending, setPending] = useState<'scan' | 'eval' | 'summary' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setPending('scan');
    setError(null);
    try {
      const r = await runScan();
      setFeedback(
        `Revisión lista: ${r.scannedCount} insumos/productos · ${r.createdCount} sugerencias nuevas · ${r.staledCount} marcadas como vencidas`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  async function handleEvalAll() {
    setPending('eval');
    setError(null);
    setFeedback(null);
    try {
      const r = await evaluateAllPending();
      setFeedback(
        r.failed > 0
          ? `Evaluadas ${r.evaluated} · ${r.failed} fallaron`
          : `Evaluadas ${r.evaluated} sugerencias`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  async function handleSendSummary() {
    setPending('summary');
    setError(null);
    setFeedback(null);
    try {
      const r = await sendSuggestionsSummary();
      if (r.recipients.length === 0) {
        setFeedback('No hay sugerencias abiertas — nada que enviar.');
      } else {
        const skipped = r.recipients.filter((x) => x.status === 'skipped').length;
        const parts = [`Enviado a ${r.sent} ${r.sent === 1 ? 'destinatario' : 'destinatarios'}`];
        if (r.failed > 0) parts.push(`${r.failed} fallaron`);
        if (skipped > 0) parts.push(`${skipped} sin teléfono`);
        setFeedback(parts.join(' · '));
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleScan}
          disabled={pending !== null}
        >
          {pending === 'scan' ? 'Revisando…' : 'Revisar ahora'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSendSummary}
          disabled={pending !== null}
          title="Manda un WhatsApp con todas las sugerencias abiertas al dueño y admins."
        >
          {pending === 'summary' ? 'Enviando…' : 'Enviar resumen por WhatsApp'}
        </Button>
        <Button
          size="sm"
          onClick={handleEvalAll}
          disabled={pending !== null}
        >
          {pending === 'eval' ? 'Evaluando…' : 'Evaluar pendientes (IA)'}
        </Button>
      </div>
      {feedback && (
        <p className="text-xs text-success sm:order-first sm:mr-3">
          {feedback}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive sm:order-first sm:mr-3">{error}</p>
      )}
    </div>
  );
}
