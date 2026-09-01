'use client';

import type { ManualDiscount } from '@pos-tercos/types';
import { Button, Dialog, formatCop } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { useCartStore } from '../store/cart-store';

type DraftSpec = { kind: ManualDiscount['kind']; value: string };

const EMPTY: DraftSpec = { kind: 'FIXED', value: '' };

function toSpec(d: DraftSpec): ManualDiscount | null {
  // Coma decimal (es-CO) → punto, para que "10,5" no muera como NaN.
  const value = Number(d.value.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (d.kind === 'PERCENT' && value > 100) return null;
  return { kind: d.kind, value };
}

/**
 * Descuento manual (#5b): por línea y/o sobre el total, fijo o %. EXCLUYENTE
 * con promos (el backend ignora promos si hay descuento manual). Sin
 * aprobación, pero exige motivo y el dueño recibe la alerta.
 */
export function DiscountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useCartStore((s) => s.items);
  const lineDiscounts = useCartStore((s) => s.lineDiscounts);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const discountReason = useCartStore((s) => s.discountReason);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const setOrderDiscount = useCartStore((s) => s.setOrderDiscount);
  const setDiscountReason = useCartStore((s) => s.setDiscountReason);
  const clearDiscounts = useCartStore((s) => s.clearDiscounts);

  const [reason, setReason] = useState('');
  const [order, setOrder] = useState<DraftSpec>(EMPTY);
  const [byLine, setByLine] = useState<Record<string, DraftSpec>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReason(discountReason);
    setOrder(
      orderDiscount ? { kind: orderDiscount.kind, value: String(orderDiscount.value) } : EMPTY,
    );
    setByLine(
      Object.fromEntries(
        Object.entries(lineDiscounts).map(([id, d]) => [
          id,
          { kind: d.kind, value: String(d.value) },
        ]),
      ),
    );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    const orderSpec = order.value.trim() ? toSpec(order) : null;
    if (order.value.trim() && !orderSpec) {
      setError('Descuento sobre el total inválido (monto > 0; % máximo 100).');
      return;
    }
    const lineSpecs: Array<[string, ManualDiscount]> = [];
    const liveLineIds = new Set(items.map((it) => it.lineId));
    for (const [lineId, draft] of Object.entries(byLine)) {
      // Línea borrada del carrito con el modal abierto → no re-crear huérfanos.
      if (!liveLineIds.has(lineId)) continue;
      if (!draft.value.trim()) continue;
      const spec = toSpec(draft);
      if (!spec) {
        setError('Hay un descuento de línea inválido (monto > 0; % máximo 100).');
        return;
      }
      lineSpecs.push([lineId, spec]);
    }
    const hasAny = orderSpec !== null || lineSpecs.length > 0;
    if (hasAny && reason.trim().length < 3) {
      setError('El descuento requiere un motivo (mínimo 3 caracteres).');
      return;
    }
    clearDiscounts();
    if (hasAny) {
      setOrderDiscount(orderSpec);
      for (const [lineId, spec] of lineSpecs) setLineDiscount(lineId, spec);
      setDiscountReason(reason.trim());
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Descuento manual"
      description="Excluyente con promociones: si aplicas descuento, las promos no corren. El dueño recibe el aviso."
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleApply}>Aplicar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SpecInputs label="Sobre el total" draft={order} onChange={(d) => setOrder(d)} />

        {items.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por línea
            </p>
            {/* El $ por línea es POR CADA UNIDAD, igual que la promoción de monto
                fijo. Sin decirlo, quien puso "$500" sobre tres bebidas no sabe si
                está regalando $500 o $1.500. */}
            <p className="text-sm text-muted-foreground sm:text-xs">
              El monto en <span className="font-semibold">$</span> se descuenta por cada unidad:
              $500 sobre 3 bebidas son $1.500. Para descontar del pedido completo, usa
              «Sobre el total».
            </p>
            {items.map((it) => (
              <SpecInputs
                key={it.lineId}
                label={`${it.quantity}x ${it.productName} · ${formatCop(it.unitPrice * it.quantity)}`}
                draft={byLine[it.lineId] ?? EMPTY}
                onChange={(d) => setByLine((prev) => ({ ...prev, [it.lineId]: d }))}
              />
            ))}
          </div>
        ) : null}

        <label className="block text-base sm:text-sm">
          <span className="mb-1 block font-medium text-foreground">Motivo (obligatorio)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Ej. cliente frecuente, demora en la entrega…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-base sm:text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function SpecInputs({
  label,
  draft,
  onChange,
}: {
  label: string;
  draft: DraftSpec;
  onChange: (d: DraftSpec) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-base sm:text-sm text-foreground">{label}</span>
      <select
        value={draft.kind}
        onChange={(e) => onChange({ ...draft, kind: e.target.value as DraftSpec['kind'] })}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-base sm:text-sm"
        aria-label={`Tipo de descuento — ${label}`}
      >
        <option value="FIXED">$</option>
        <option value="PERCENT">%</option>
      </select>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        value={draft.value}
        onChange={(e) => onChange({ ...draft, value: e.target.value })}
        placeholder="0"
        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right text-base sm:text-sm tabular-nums"
        aria-label={`Valor del descuento — ${label}`}
      />
    </div>
  );
}
