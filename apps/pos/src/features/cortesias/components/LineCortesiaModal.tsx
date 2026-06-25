'use client';

import { Button, Dialog, FormField, Input, NumberInput } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import type { CartLine } from '../../sales/lib/cart-types';
import { createCortesia } from '../api/client';

/**
 * Marca una línea del carrito (o parte de su cantidad) como cortesía: la
 * registra y la SACA del cobro. El resto de la cuenta sigue para pagar.
 */
export function LineCortesiaModal({
  line,
  open,
  onClose,
  onComped,
}: {
  line: CartLine | null;
  open: boolean;
  onClose: () => void;
  /** Cantidad efectivamente regalada → el carrito la descuenta de la línea. */
  onComped: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    setQuantity(line.quantity);
    setReason('');
    setError(null);
    setPending(false);
  }, [open, line]);

  const maxQty = line?.quantity ?? 1;
  const reasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  const canConfirm = line !== null && quantity >= 1 && quantity <= maxQty && reasonValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm || !line) return;
    setPending(true);
    setError(null);
    try {
      await createCortesia({
        productId: line.productId,
        sizeId: line.size?.id ?? null,
        quantity,
        reason: reason.trim(),
      });
      onComped(quantity);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar la cortesía'));
      setPending(false);
    }
  };

  if (!line) return null;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title={`Cortesía · ${line.productName}`}
      description="Se saca del cobro y queda registrada para que el dueño la revise."
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {pending ? 'Registrando…' : 'Regalar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {maxQty > 1 ? (
          <FormField label={`Cantidad a regalar (de ${maxQty})`}>
            <NumberInput
              value={quantity}
              min={1}
              max={maxQty}
              onChange={(v) => setQuantity(Math.min(maxQty, Math.max(1, v ?? 1)))}
            />
          </FormField>
        ) : null}

        <FormField label="Motivo (3-200 caracteres)" hint={`${reason.trim().length}/200 · queda en auditoría`}>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cliente frecuente / producto con demora"
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
