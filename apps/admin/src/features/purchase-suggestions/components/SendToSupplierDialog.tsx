'use client';

import type { HistoricalSupplier, PurchaseSuggestion } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, Select, formatCop } from '@pos-tercos/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listSuggestionSuppliers, sendToSupplier } from '../api';
import { getErrorMessage } from '../../../lib/errors';

interface Props {
  suggestion: PurchaseSuggestion;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Diálogo para enviar el pedido a un proveedor por WhatsApp. Lista los
 * proveedores que han vendido ese item; el más reciente queda seleccionado
 * por default. Al enviar, marca la sugerencia como ACEPTADA.
 */
export function SendToSupplierDialog({ suggestion, onClose, onSuccess }: Props) {
  const [suppliers, setSuppliers] = useState<HistoricalSupplier[] | null>(null);
  const [supplierId, setSupplierId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>(String(suggestion.suggestedQty));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el timer de éxito diferido si el diálogo se desmonta antes de disparar
  // (evita llamar onSuccess sobre un componente ya desmontado).
  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSuggestionSuppliers(suggestion.id)
      .then((res) => {
        if (cancelled) return;
        setSuppliers(res);
        const last = res.find((s) => s.isLast) ?? res[0];
        if (last) setSupplierId(last.supplierId);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'No se pudieron cargar los proveedores.'));
      });
    return () => {
      cancelled = true;
    };
  }, [suggestion.id]);

  const selected = useMemo(
    () => suppliers?.find((s) => s.supplierId === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const canSend = supplierId && Number(quantity) > 0 && !pending;

  const handleSend = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const res = await sendToSupplier(suggestion.id, {
        supplierId,
        quantity: Number(quantity),
        note: note.trim() || undefined,
      });
      const r = res.outcome.recipients[0];
      if (r?.status !== 'sent') {
        // El backend ya marcó la sugerencia ACCEPTED igual; mostramos error pero no bloqueamos.
        setError(`Marcada como aceptada, pero el envío de WhatsApp falló: ${r?.reason ?? 'desconocido'}.`);
        // Igual notificamos éxito de la decisión.
        successTimer.current = setTimeout(onSuccess, 1500);
        return;
      }
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo enviar el pedido.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Enviar pedido al proveedor"
      description={`${suggestion.entityName ?? 'item'} · sugerido: ${suggestion.suggestedQty} ${suggestion.unitPurchase}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {pending ? 'Enviando…' : 'Enviar por WhatsApp'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!suppliers ? (
          <p className="text-sm text-muted-foreground">Cargando proveedores…</p>
        ) : suppliers.length === 0 ? (
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
            Este item no tiene ningún proveedor histórico. Carga una factura primero para asociar un
            proveedor.
          </p>
        ) : (
          <>
            <FormField
              label="Proveedor"
              hint={
                selected?.isLast
                  ? 'El más reciente que vendió este item.'
                  : 'Otro proveedor que ya ha vendido este item.'
              }
            >
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={pending}>
                {suppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.name}
                    {s.isLast ? ' (más reciente)' : ''}
                    {s.lastUnitPrice !== null ? ` · ${formatCop(s.lastUnitPrice)} / ${suggestion.unitPurchase}` : ''}
                    {!s.isActive ? ' · inactivo' : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            {selected && !selected.phone ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Este proveedor no tiene WhatsApp configurado. Editalo desde Compras → Proveedores
                para poder enviar el pedido.
              </p>
            ) : null}

            <FormField label={`Cantidad (en ${suggestion.unitPurchase})`}>
              <Input
                type="number"
                min={0}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={pending}
              />
            </FormField>

            <FormField label="Nota extra" hint="Opcional. Se agrega al mensaje del proveedor.">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                placeholder="Ej. urgente para mañana"
              />
            </FormField>
          </>
        )}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
