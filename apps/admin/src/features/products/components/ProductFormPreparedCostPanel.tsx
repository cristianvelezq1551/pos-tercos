'use client';

import type { ExpandedCostResponse } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getExpandedCost } from '../../recipes';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

interface ProductFormPreparedCostPanelProps {
  productId: string;
  /** Precio de venta que el dueño está editando (string del input). */
  basePriceInput: string;
}

/**
 * Costo + margen para productos PREPARADOS (con receta). Read-only: el costo
 * sale de expandir la receta con el último costo de cada insumo. Antes este
 * panel solo existía para reventa directa, así que un preparado se editaba
 * "a ciegas" sin saber cuánto cuesta ni qué margen deja el precio.
 */
export function ProductFormPreparedCostPanel({
  productId,
  basePriceInput,
}: ProductFormPreparedCostPanelProps) {
  const [cost, setCost] = useState<ExpandedCostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getExpandedCost(productId)
      .then((r) => {
        if (!cancelled) {
          setCost(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (error) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        No se pudo calcular el costo de la receta: {error}
      </div>
    );
  }
  if (!cost) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Calculando costo de la receta…
      </div>
    );
  }

  const basePrice = Number(basePriceInput);
  const marginPct =
    cost.totalCost !== null && Number.isFinite(basePrice) && basePrice > 0
      ? ((basePrice - cost.totalCost) / basePrice) * 100
      : null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Costo de receta (solo lectura)
        </p>
        <Link
          href={`/products/${productId}/recipe`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver / editar receta
        </Link>
      </div>

      {cost.totalCost === null ? (
        <div>
          <p className="text-sm font-medium text-warning">Todavía no se puede calcular el costo:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {cost.missingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Costo por unidad" value={formatCop(cost.totalCost)} />
          <Stat
            label="Margen"
            value={marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
            toneClass={marginPct !== null ? MARGIN_TONE_CLASS[marginTone(marginPct)] : undefined}
          />
          <Stat
            label="Ganancia por unidad"
            value={
              marginPct !== null && Number.isFinite(basePrice)
                ? formatCop(basePrice - cost.totalCost)
                : '—'
            }
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Costo de la <strong>receta base</strong> con el último costo de compra de cada insumo. El
        margen se recalcula con el precio de venta que estás editando.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <div className="rounded-md bg-card px-3 py-2 ring-1 ring-border">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${toneClass ?? 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
