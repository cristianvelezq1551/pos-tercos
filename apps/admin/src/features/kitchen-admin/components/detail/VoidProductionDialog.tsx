'use client';

import type { KitchenProductionRun, VoidProductionPreview } from '@pos-tercos/types';
import { Button, Dialog, Label, Textarea } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { previewProductionVoid, voidProduction } from '../../api/client';
import { getErrorMessage } from '../../../../lib/errors';

const MIN_MOTIVO = 5;

/**
 * 44px de alto en teléfono: es el piso táctil del proyecto (§7.v18) y este es
 * el botón que decide una anulación. El `Button` compartido mide 40 y no se
 * toca — lo usan las cinco apps.
 *
 * ⚠️ Va en píxeles y no `h-11`: en el admin el `rem` base no es 16px, así que
 * `h-11` (2.75rem) mide 43,2 — por debajo del piso. Medido, no supuesto.
 */
const ALTO_TACTIL = 'min-h-[44px] sm:min-h-0';

/**
 * Anula una tanda mal registrada: los insumos vuelven a su lote y el
 * subproducto deja de existir.
 *
 * Muestra el efecto ANTES de decidir, y en rojo lo que quedaría en negativo:
 * eso es lo que la caja va a frenar el mismo día, y sin el aviso anular se
 * siente inofensivo.
 */
export function VoidProductionDialog({
  run,
  open,
  onClose,
  onVoided,
}: {
  run: KitchenProductionRun;
  open: boolean;
  onClose: () => void;
  onVoided: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [preview, setPreview] = useState<VoidProductionPreview | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setCargando(true);
    setError(null);
    previewProductionVoid(run.runId)
      .then((p) => {
        if (vigente) setPreview(p);
      })
      .catch((e: unknown) => {
        if (vigente) setError(getErrorMessage(e, 'No se pudo calcular el efecto de anular.'));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [open, run.runId]);

  const bloqueado = preview?.blockedReason ?? null;
  const puedeAnular =
    !bloqueado && !cargando && !enviando && motivo.trim().length >= MIN_MOTIVO;

  async function anular() {
    if (!puedeAnular) return;
    setEnviando(true);
    setError(null);
    try {
      await voidProduction(run.runId, { reason: motivo.trim() });
      onVoided();
      onClose();
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo anular la tanda.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={enviando ? () => undefined : onClose}
      title="Anular tanda de producción"
      description={`${run.subproductName} · ${run.quantityProduced} ${run.unit}`}
      maxWidth="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className={ALTO_TACTIL} onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className={ALTO_TACTIL}
            onClick={anular}
            disabled={!puedeAnular}
          >
            {enviando ? 'Anulando…' : 'Anular tanda'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {bloqueado ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
            {bloqueado}
          </p>
        ) : (
          <p className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
            Los insumos vuelven al inventario con su costo original y el
            subproducto deja de existir, como si la tanda nunca se hubiera
            registrado. Queda el registro de la anulación con tu motivo — nada
            se borra.
          </p>
        )}

        {cargando ? (
          <p className="text-sm text-muted-foreground">Calculando el efecto…</p>
        ) : null}

        {!bloqueado && preview && preview.lines.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Cómo queda el inventario</span>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {preview.lines.map((l) => (
                <li
                  key={`${l.entityType}:${l.entityId}`}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground">{l.name}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                    {l.currentStock} →{' '}
                    <span className={l.resultingStock < 0 ? 'font-medium text-destructive' : ''}>
                      {l.resultingStock}
                    </span>{' '}
                    {l.unit}
                  </span>
                </li>
              ))}
            </ul>
            {preview.goesNegative.length > 0 ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                {preview.goesNegative.join(', ')} {preview.goesNegative.length === 1 ? 'queda' : 'quedan'}{' '}
                en negativo: ya se vendió parte de lo que esta tanda produjo. La
                caja va a frenar la venta de lo que dependa de{' '}
                {preview.goesNegative.length === 1 ? 'ese ítem' : 'esos ítems'} hasta
                que se registre la producción real.
              </p>
            ) : null}
          </div>
        ) : null}

        {!bloqueado ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="void-production-reason">Motivo de la anulación</Label>
            <Textarea
              id="void-production-reason"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se registraron 100 porciones en vez de 10"
              rows={3}
              maxLength={300}
            />
            {motivo.length > 0 && motivo.trim().length < MIN_MOTIVO ? (
              <span className="text-xs text-destructive">
                Escribe al menos {MIN_MOTIVO} caracteres.
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
