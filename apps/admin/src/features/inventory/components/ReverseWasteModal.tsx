'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryMovement } from '@pos-tercos/types';
import { Button, Dialog, Label, NumberInput, Textarea } from '@pos-tercos/ui';
import { reverseWaste } from '../api';
import { getErrorMessage } from '../../../lib/errors';

interface ReverseWasteModalProps {
  movement: InventoryMovement;
  open: boolean;
  onClose: () => void;
}

const MIN_REASON = 5;

/**
 * Anula una merma registrada por error. Devolver TODO deshace la pérdida
 * completa; devolver una parte deja en el estado financiero solo lo que de
 * verdad se tiró (el caso típico: "10 kg" tecleado en vez de "1 kg").
 */
export function ReverseWasteModal({ movement, open, onClose }: ReverseWasteModalProps) {
  const router = useRouter();
  const wasted = Math.abs(movement.delta);

  const [reason, setReason] = useState('');
  const [partial, setPartial] = useState(false);
  const [quantity, setQuantity] = useState<number | null>(wasted);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = partial ? quantity : wasted;
  const canSubmit =
    reason.trim().length >= MIN_REASON &&
    qty !== null &&
    qty > 0 &&
    qty <= wasted &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await reverseWaste(movement.id, {
        reason: reason.trim(),
        quantity: partial ? qty : null,
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo anular la merma.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Anular merma"
      description={`${movement.itemName ?? 'Ítem'} · se registraron ${wasted} de merma`}
      maxWidth="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Anulando…' : 'Anular merma'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
          El stock vuelve con su costo original y la pérdida sale del estado
          financiero. Queda registrada la anulación con tu motivo — el
          movimiento original no se borra.
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reverse-waste-reason">Motivo de la anulación</Label>
          <Textarea
            id="reverse-waste-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: se registró por error, la carne no se tiró"
            rows={3}
            maxLength={200}
          />
          {reason.length > 0 && reason.trim().length < MIN_REASON ? (
            <span className="text-xs text-destructive">
              Escribe al menos {MIN_REASON} caracteres.
            </span>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={partial}
            onChange={(e) => {
              setPartial(e.target.checked);
              setQuantity(wasted);
            }}
            className="size-4 accent-primary"
          />
          Devolver solo una parte
        </label>

        {partial ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="reverse-waste-qty">Cantidad a devolver</Label>
            <NumberInput
              id="reverse-waste-qty"
              value={quantity}
              onChange={setQuantity}
              decimals={4}
              min={0}
              max={wasted}
            />
            <span className="text-xs text-muted-foreground">
              Máximo {wasted}. Lo que no devuelvas queda como pérdida real.
            </span>
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
