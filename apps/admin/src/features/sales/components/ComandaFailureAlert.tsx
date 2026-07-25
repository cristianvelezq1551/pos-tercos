'use client';

import { Button } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { printComanda, sendTabToKitchen } from '../api/print';
import {
  onComandaFailed,
  type ComandaFailure,
  type ComandaFailureKind,
} from '../lib/comanda-events';

const KIND_LABEL: Record<ComandaFailureKind, string> = {
  comanda: 'La comanda de cocina',
  tanda: 'La tanda para cocina',
  anulacion: 'El ticket de ANULACIÓN para cocina',
  modificada: 'La comanda corregida',
};

/**
 * Aviso PERSISTENTE cuando una comanda no llegó a la impresora (A2): la plata
 * ya se cobró pero la cocina no vio el pedido — sin esto, el fallo moría en el
 * log y el pedido no se preparaba. Vive en el layout autenticado del POS.
 */
export function ComandaFailureAlert() {
  const [failures, setFailures] = useState<ComandaFailure[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(
    () =>
      onComandaFailed((f) =>
        setFailures((prev) =>
          prev.some((p) => p.saleId === f.saleId && p.kind === f.kind) ? prev : [...prev, f],
        ),
      ),
    [],
  );

  if (failures.length === 0) return null;

  const retry = async (f: ComandaFailure) => {
    setBusyId(f.saleId);
    setRetryError(null);
    try {
      if (f.kind === 'tanda') {
        await sendTabToKitchen(f.saleId);
      } else {
        await printComanda(f.saleId, {
          cancel: f.kind === 'anulacion',
          corrected: f.kind === 'modificada',
        });
      }
      setFailures((prev) => prev.filter((p) => !(p.saleId === f.saleId && p.kind === f.kind)));
    } catch (err) {
      logError('comanda-retry', err, { saleId: f.saleId });
      setRetryError(getErrorMessage(err, 'Sigue sin imprimir — revisa la impresora / print-agent'));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = (f: ComandaFailure) =>
    setFailures((prev) => prev.filter((p) => !(p.saleId === f.saleId && p.kind === f.kind)));

  return (
    <div className="fixed inset-x-0 top-14 z-50 mx-auto w-fit max-w-[92vw] space-y-2">
      {failures.map((f) => (
        <div
          key={`${f.saleId}-${f.kind}`}
          role="alert"
          className="flex items-center gap-3 rounded-lg border-2 border-destructive bg-destructive/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          <span>
            ⚠️ {KIND_LABEL[f.kind]}
            {f.receiptNumber ? ` del pedido #${f.receiptNumber}` : ''} <b>NO se imprimió</b> — la
            cocina no lo vio.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-white bg-white/10 text-white hover:bg-white/25"
            disabled={busyId === f.saleId}
            onClick={() => void retry(f)}
          >
            {busyId === f.saleId ? 'Imprimiendo…' : 'Reintentar'}
          </Button>
          <button
            type="button"
            aria-label="Descartar aviso"
            className="text-white/80 hover:text-white"
            onClick={() => dismiss(f)}
          >
            ✕
          </button>
        </div>
      ))}
      {retryError ? (
        <p className="mx-auto w-fit rounded-md bg-destructive px-3 py-1 text-xs text-white">
          {retryError}
        </p>
      ) : null}
    </div>
  );
}
