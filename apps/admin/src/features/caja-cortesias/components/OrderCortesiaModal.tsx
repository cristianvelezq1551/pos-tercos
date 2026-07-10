'use client';

import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import type { CartLine } from '../../sales/lib/cart-types';
import { createCortesia } from '../api/client';

/**
 * Marca TODO el pedido del carrito como cortesía: registra cada línea, las saca
 * del cobro y espera la revisión del dueño. Es todo o nada (no se elige un
 * producto sí y otro no).
 */
export function OrderCortesiaModal({
  items,
  open,
  onClose,
  onDone,
}: {
  items: readonly CartLine[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    setPending(false);
  }, [open]);

  const reasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  const canConfirm = items.length > 0 && reasonValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPending(true);
    setError(null);
    try {
      for (const it of items) {
        await createCortesia({
          productId: it.productId,
          sizeId: it.size?.id ?? null,
          quantity: it.quantity,
          reason: reason.trim(),
        });
      }
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar la cortesía'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Marcar pedido como cortesía"
      description="Todo el pedido se regala y queda registrado para que el dueño lo revise."
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {pending ? 'Registrando…' : 'Regalar pedido'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          {items.map((it) => (
            <li key={it.lineId} className="flex justify-between gap-2">
              <span className="text-foreground">
                {it.quantity}× {it.productName}
                {it.size?.name ? ` · ${it.size.name}` : ''}
              </span>
            </li>
          ))}
        </ul>

        <FormField label="Motivo (3-200 caracteres)" hint={`${reason.trim().length}/200 · queda en auditoría`}>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cliente frecuente / influencer / producto con demora"
            maxLength={200}
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
