'use client';

import type { Product } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, NumberInput, Select } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { fetchActiveProducts } from '../../catalog';
import { getErrorMessage } from '../../../lib/errors';
import { createCortesia } from '../api/client';

/**
 * Solicitud de cortesía: el cajero regala un producto (línea de un pedido o
 * suelto). Descuenta stock al instante y queda PENDING para que un admin/dueño
 * la confirme en el panel de Solicitudes. Se registra como gasto a costo.
 */
export function CortesiaModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProductId('');
    setQuantity(1);
    setReason('');
    setError(null);
    setPending(false);
    setDone(false);
    void fetchActiveProducts().then(setProducts).catch(() => setProducts([]));
  }, [open]);

  const reasonValid = reason.trim().length >= 3 && reason.trim().length <= 200;
  const canConfirm = productId !== '' && quantity >= 1 && reasonValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPending(true);
    setError(null);
    try {
      await createCortesia({ productId, quantity, reason: reason.trim() });
      onDone();
      setDone(true);
      setPending(false);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar la cortesía'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cortesía"
      description="Regalo de un producto. Descuenta stock y queda registrada para que el dueño la revise."
      maxWidth="max-w-md"
      footer={
        done ? (
          <Button onClick={onClose}>Cerrar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={!canConfirm}>
              {pending ? 'Registrando…' : 'Registrar cortesía'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-2 rounded-lg border border-success-border bg-success-bg px-4 py-5 text-center">
          <p className="text-sm font-semibold text-success">✓ Cortesía registrada</p>
          <p className="text-xs text-muted-foreground">
            Queda <strong>Sin revisar</strong>. El dueño la revisa; vas a ver el
            resultado en Historial → Cortesías.
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        <FormField label="Producto">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Seleccioná un producto…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Cantidad">
          <NumberInput
            value={quantity}
            min={1}
            max={99}
            onChange={(v) => setQuantity(Math.max(1, v ?? 1))}
          />
        </FormField>

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
      )}
    </Dialog>
  );
}
