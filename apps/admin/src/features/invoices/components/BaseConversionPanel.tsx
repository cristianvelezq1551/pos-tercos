'use client';

import type { Stockable } from '@pos-tercos/types';
import { Input, Label, formatCop } from '@pos-tercos/ui';
import { suggestBaseFactor } from './suggest-base-factor';

interface LineForConversion {
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  baseFactor?: number | null;
  packUnits?: number | null;
  packSizePerUnit?: number | null;
  packSizeMeasure?: string | null;
}

/**
 * Panel de conversión a la unidad BASE del insumo. Hace VISIBLE y EDITABLE
 * cuántas unidades base entran al stock y a qué costo por unidad base — esa
 * visibilidad es lo que garantiza un costeo FIFO exacto: el operador confirma
 * la conversión real de la compra antes de que toque el inventario.
 */
export function BaseConversionPanel({
  stockable,
  line,
  onChange,
  disabled,
}: {
  stockable: Stockable;
  line: LineForConversion;
  onChange: (baseFactor: number) => void;
  disabled?: boolean;
}) {
  const base = stockable.unitStock || 'unidad';
  const suggested = suggestBaseFactor(stockable, line);
  const factor = line.baseFactor != null && line.baseFactor > 0 ? line.baseFactor : suggested;
  const baseQty = Math.round(line.quantity * factor * 10000) / 10000;
  const costPerBase = baseQty > 0 ? line.total / baseQty : 0;
  const usingSuggestion = line.baseFactor == null || line.baseFactor === suggested;

  return (
    <div className="space-y-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
        Conversión a inventario · {stockable.name} (base: {base})
      </p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <span className="pb-2 text-muted-foreground">1 {line.unit || 'unidad'} =</span>
        <div className="w-28 space-y-1">
          <Label htmlFor="bcf">{base} por unidad</Label>
          <Input
            id="bcf"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={disabled}
            value={String(factor)}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
          />
        </div>
        {line.packUnits && !usingSuggestion ? (
          <button
            type="button"
            onClick={() => onChange(suggested)}
            disabled={disabled}
            className="pb-2 text-[11px] font-medium text-blue-400 hover:underline"
          >
            usar sugerencia IA ({suggested} {base})
          </button>
        ) : null}
      </div>
      <p className="text-xs">
        <span className="text-muted-foreground">Entra al stock:</span>{' '}
        <strong className="text-foreground tabular-nums">
          {baseQty.toLocaleString('es-CO')} {base}
        </strong>
        <span className="text-muted-foreground"> · costo </span>
        <strong className="text-foreground">{formatCop(costPerBase)}/{base}</strong>
      </p>
    </div>
  );
}
