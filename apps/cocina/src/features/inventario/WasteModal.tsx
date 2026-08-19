'use client';

import type { Stockable } from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { randomUUID } from '../../lib/uuid';
import { registerWaste, stockableRef } from './api';

/** Registrar merma/desperdicio de un stockable. Motivo obligatorio. */
export function WasteModal({
  stockable,
  open,
  onClose,
  onDone,
}: {
  stockable: Stockable | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => randomUUID());

  if (!stockable) return null;

  const close = () => {
    setQty('');
    setReason('');
    setError(null);
    // §3.3: resetear `pending` SIEMPRE al cerrar. El camino de éxito hacía
    // `onDone(); close()` sin bajar `pending` → como el modal vive montado, la
    // 2ª merma abría con "Registrando…", botones deshabilitados y sin poder
    // cerrarse (onClose gateado por pending) → única salida, recargar.
    setPending(false);
    setIdempotencyKey(randomUUID());
    onClose();
  };

  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return setError('Cantidad mayor a 0.');
    if (reason.trim().length < 3) return setError('Escribe un motivo.');
    setPending(true);
    setError(null);
    try {
      await registerWaste({ ...stockableRef(stockable), quantity: n, reason: reason.trim(), idempotencyKey });
      onDone();
      close();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar la merma'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : close}
      title={`Merma · ${stockable.name}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={pending}>
            {pending ? 'Registrando…' : 'Registrar merma'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Stock actual: <b className="text-foreground">{fmt(stockable.currentStock)}</b> {stockable.unitStock}
        </p>
        <div>
          <Label htmlFor="wqty">Cantidad descartada ({stockable.unitStock})</Label>
          <Input id="wqty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </div>
        <div>
          <Label htmlFor="wreason">Motivo</Label>
          <Input id="wreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="se quemó, vencido, se cayó…" />
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
