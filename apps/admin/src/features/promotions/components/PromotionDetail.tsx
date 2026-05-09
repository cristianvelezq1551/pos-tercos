'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import type { Product, Promotion } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';
import { deactivatePromotion } from '../api';

interface PromotionDetailProps {
  promotion: Promotion;
  products: Product[];
}

export function PromotionDetail({ promotion, products }: PromotionDetailProps) {
  const router = useRouter();
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const linkedProducts = promotion.productIds
    .map((id) => productMap.get(id))
    .filter((p): p is Product => p !== undefined);

  async function handleDeactivate() {
    if (!confirm('¿Desactivar esta promoción? No se puede revertir vía UI.')) return;
    setDeactivating(true);
    setError(null);
    try {
      await deactivatePromotion(promotion.id);
      router.push('/promotions');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeactivating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Tipo" value={promotion.type} mono />
          <Row label="Estado" value={promotion.isActive ? 'Activa' : 'Inactiva'} />
          <Row label="Descuento" value={describeDiscount(promotion)} mono />
          <Row label="Días" value={describeDays(promotion.daysOfWeekMask)} mono />
          <Row
            label="Horario"
            value={`${hhmm(promotion.timeStart)} – ${hhmm(promotion.timeEnd)}`}
            mono
          />
          <Row
            label="Vigencia"
            value={
              !promotion.activeFrom && !promotion.activeTo
                ? 'Sin límite'
                : `${promotion.activeFrom ?? '—'} → ${promotion.activeTo ?? '—'}`
            }
            mono
          />
          <Row label="Creada por" value={promotion.createdByName ?? '—'} />
          <Row
            label="Creada el"
            value={new Date(promotion.createdAt).toLocaleString('es-CO')}
            mono
          />
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Productos ({linkedProducts.length})
        </h2>
        {linkedProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin productos asociados.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {linkedProducts.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm"
              >
                <span>{p.name}</span>
                {p.isCombo && (
                  <span className="ml-auto text-xs text-purple-600">combo</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => router.push('/promotions')}>
          Volver al listado
        </Button>
        {promotion.isActive && (
          <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
            {deactivating ? 'Desactivando…' : 'Desactivar promoción'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Editar campos por-tipo (ej. cambiar % o monto fijo) no está soportado: para
        modificar el descuento, desactivá esta promo y crea una nueva.
      </p>
    </div>
  );
}

function describeDiscount(p: Promotion): string {
  switch (p.type) {
    case 'PERCENT_OFF':
      return p.discountPct !== null ? `${(p.discountPct * 100).toFixed(0)}%` : '—';
    case 'FIXED_OFF':
      return p.discountFixed !== null ? formatCop(p.discountFixed) : '—';
    case 'BOGO':
      return `Compra ${p.bogoBuyQty ?? '?'}, lleva ${p.bogoGetQty ?? '?'} gratis`;
    case 'COMBO_OFF': {
      if (p.discountPct !== null)
        return `${(p.discountPct * 100).toFixed(0)}% (solo combos)`;
      if (p.discountFixed !== null) return `${formatCop(p.discountFixed)} (solo combos)`;
      return '—';
    }
  }
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function describeDays(mask: number): string {
  if (mask === 127) return 'Todos los días';
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    if ((mask & (1 << i)) !== 0) days.push(DAY_LABELS[i]);
  }
  return days.join(', ');
}

function hhmm(s: string): string {
  return s.slice(0, 5);
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </>
  );
}
