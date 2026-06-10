'use client';

import type { Product } from '@pos-tercos/types';
import { formatCop as fmtCop } from '../../../lib/format';
import { marginTone } from '../../../lib/margin-thresholds';

interface ProductFormCostInfoPanelProps {
  product: Product;
  basePriceInput: string;
}

/**
 * Bloque de costo histórico para productos direct-resale. Es read-only:
 * `lastUnitCost` se actualiza automáticamente al confirmar facturas.
 * Calcula margen vs `basePrice` que el dueño está editando.
 */
export function ProductFormCostInfoPanel({ product, basePriceInput }: ProductFormCostInfoPanelProps) {
  const cost = product.lastUnitCost;
  const factor = product.conversionFactor;
  const unitPurchase = product.unitPurchase ?? '';
  const unitStock = product.unitStock ?? '';
  const date = product.lastUnitCostDate;

  const costPerStock =
    cost !== null && cost !== undefined && factor && factor > 0 ? cost / factor : null;

  const basePrice = Number(basePriceInput);
  const margin =
    costPerStock !== null && Number.isFinite(basePrice) && basePrice > 0
      ? ((basePrice - costPerStock) / basePrice) * 100
      : null;

  if (cost === null || cost === undefined) {
    return (
      <div className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-3 text-sm text-warning">
        <p className="font-medium">Sin costo histórico aún</p>
        <p className="mt-1 text-xs text-warning">
          Este producto se creó como reventa directa, pero todavía no se cargó en ninguna factura
          confirmada. Una vez registres una factura con este producto, vas a ver aquí su último
          costo y el margen sobre el precio de venta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Costo histórico (solo lectura)
        </p>
        {date && (
          <span className="text-xs text-muted-foreground">
            actualizado {new Date(date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CostStat
          label={`Costo por ${unitPurchase || 'unidad compra'}`}
          value={fmtCop(cost)}
        />
        <CostStat
          label={`Costo por ${unitStock || 'unidad venta'}`}
          value={costPerStock !== null ? fmtCop(costPerStock) : '—'}
          hint={
            factor
              ? `÷ factor ${factor}`
              : 'Falta el factor de conversión para calcular el costo por unidad de venta'
          }
        />
        <CostStat
          label="Margen"
          value={margin !== null ? `${margin.toFixed(1)}%` : '—'}
          tone={
            margin === null
              ? undefined
              : (() => {
                  const t = marginTone(margin);
                  return t === 'good' ? 'good' : t === 'warn' ? 'warn' : 'bad';
                })()
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        El costo se actualiza automáticamente cada vez que confirmas una factura con este producto.
        El margen se recalcula en vivo según el precio de venta que estás editando arriba.
      </p>
    </div>
  );
}

function CostStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-warning'
        : tone === 'bad'
          ? 'text-destructive'
          : 'text-foreground';
  return (
    <div className="rounded-md bg-card px-3 py-2 ring-1 ring-gray-200">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
