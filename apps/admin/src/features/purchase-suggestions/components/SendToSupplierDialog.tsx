'use client';

import type { HistoricalSupplier, PurchaseSuggestion, SupplierOrderLink } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, Select, formatCop } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { listSuggestionSuppliers, markSupplierOrder, previewSupplierOrder } from '../api';
import { getErrorMessage } from '../../../lib/errors';

interface Props {
  suggestion: PurchaseSuggestion;
  onClose: () => void;
  onSuccess: () => void;
}

/** YYYY-MM-DD en hora local — nunca `toISOString`, que corre el día en Bogotá. */
function ymdLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Prepara el pedido para UN proveedor y abre su chat de WhatsApp con el texto
 * ya escrito. El sistema NO envía el mensaje: lo manda quien compra, desde su
 * propio WhatsApp, y puede editarlo antes. Al abrir el chat, la sugerencia
 * queda aceptada.
 */
export function SendToSupplierDialog({ suggestion, onClose, onSuccess }: Props) {
  const [suppliers, setSuppliers] = useState<HistoricalSupplier[] | null>(null);
  const [supplierId, setSupplierId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>(String(suggestion.suggestedQty));
  // Por defecto mañana: lo habitual es pedir hoy para recibir al día siguiente.
  const [todayYmd] = useState(() => ymdLocal(new Date()));
  const [neededBy, setNeededBy] = useState(() => ymdLocal(addDays(new Date(), 1)));
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<SupplierOrderLink | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const qty = Number(quantity);

  // La vista previa se rearma cuando cambia proveedor, cantidad, día o nota.
  // Con retraso: el texto se recalcula al dejar de escribir, no en cada tecla.
  useEffect(() => {
    if (!supplierId || !(qty > 0)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    const timer = setTimeout(() => {
      previewSupplierOrder(suggestion.id, {
        supplierId,
        quantity: qty,
        neededBy: neededBy || undefined,
        note: note.trim() || undefined,
      })
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch((e) => {
          if (!cancelled) setError(getErrorMessage(e, 'No se pudo armar el mensaje.'));
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [suggestion.id, supplierId, qty, neededBy, note]);

  const selected = useMemo(
    () => suppliers?.find((s) => s.supplierId === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const canOpen = Boolean(preview?.url) && !pending;

  /**
   * `window.open` va PRIMERO y sin `await` en el medio: si el navegador no ve
   * la apertura dentro del click, la bloquea como popup.
   */
  const handleOpen = async (): Promise<void> => {
    if (!preview?.url) return;
    window.open(preview.url, '_blank', 'noopener,noreferrer');
    setError(null);
    setPending(true);
    try {
      await markSupplierOrder(suggestion.id, {
        supplierId,
        quantity: qty,
        neededBy: neededBy || undefined,
        note: note.trim() || undefined,
      });
      onSuccess();
    } catch (e) {
      setError(
        `Se abrió WhatsApp, pero la sugerencia no quedó marcada como pedida: ${getErrorMessage(e, 'error desconocido')}`,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Pedir al proveedor por WhatsApp"
      description={`${suggestion.entityName ?? 'item'} · sugerido: ${suggestion.suggestedQty} ${suggestion.unitPurchase}`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleOpen} disabled={!canOpen}>
            {pending ? 'Abriendo…' : 'Abrir WhatsApp'}
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
                para poder abrir el chat.
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

            <FormField label="¿Para qué día lo quieres?" hint="Va en el mensaje al proveedor.">
              <Input
                type="date"
                min={todayYmd}
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                disabled={pending}
              />
            </FormField>

            <FormField label="Nota extra" hint="Opcional. Se agrega al mensaje del proveedor.">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                placeholder="Ej. que venga bien fresco"
              />
            </FormField>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Así le va a llegar {loadingPreview ? '· actualizando…' : ''}
              </p>
              <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-3 py-2 font-sans text-xs leading-relaxed text-foreground">
                {preview?.messagePlain ?? 'Elige proveedor y cantidad para ver el mensaje.'}
              </pre>
              <p className="mt-1.5 text-xs text-muted-foreground">
                No se envía solo: se abre el chat con el texto escrito y tú lo mandas. Puedes
                editarlo antes de enviar. Al abrirlo, la sugerencia queda aceptada.
              </p>
            </div>
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
