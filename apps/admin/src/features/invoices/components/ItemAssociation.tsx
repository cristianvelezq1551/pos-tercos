'use client';

import type { Stockable, StockableType } from '@pos-tercos/types';
import { Button, Label } from '@pos-tercos/ui';
import { useState } from 'react';
import { BaseConversionPanel } from './BaseConversionPanel';
import { CreateStockableInline } from './CreateStockableInline';
import type { DraftRow } from './InvoiceItemRow';
import { suggestBaseFactor } from './suggest-base-factor';

/** Sección de asociación de una línea de factura: dropdown + crear nuevo +
 *  sugerencia fuzzy + panel de conversión a la unidad base (garantía FIFO). */
export function ItemAssociation({
  row,
  stockables,
  disabled,
  onChange,
  onStockableCreated,
}: {
  row: DraftRow;
  stockables: Stockable[];
  disabled?: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onStockableCreated: (item: Stockable) => void;
}) {
  const [creating, setCreating] = useState(false);
  const isMatched = row.selection !== null;
  const dropdownValue = row.selection ? `${row.selection.entityType}:${row.selection.id}` : '';
  const matched =
    row.selection &&
    (stockables.find((s) => s.type === row.selection!.entityType && s.id === row.selection!.id) ?? null);

  /** Asocia + SIEMBRA el factor de conversión a base (el panel lo deja editar). */
  const selectStockable = (entityType: StockableType, id: string, created?: Stockable): void => {
    const st = created ?? stockables.find((s) => s.type === entityType && s.id === id);
    onChange({ selection: { entityType, id }, baseFactor: st ? suggestBaseFactor(st, row) : null });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`stk-${row.localId}`}>Asociar a Insumo o Producto del catálogo</Label>
        <div className="flex gap-2">
          <select
            id={`stk-${row.localId}`}
            value={dropdownValue}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                onChange({ selection: null, baseFactor: null });
              } else {
                const [entityType, id] = v.split(':') as [StockableType, string];
                selectStockable(entityType, id);
              }
            }}
            disabled={disabled}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Seleccionar —</option>
            <optgroup label="Insumos (entran en recetas)">
              {stockables
                .filter((s) => s.type === 'INGREDIENT')
                .map((s) => (
                  <option key={`i-${s.id}`} value={`INGREDIENT:${s.id}`}>
                    {s.name} ({s.unitPurchase} → {s.unitStock})
                  </option>
                ))}
            </optgroup>
            <optgroup label="Productos de reventa directa (se venden tal cual)">
              {stockables
                .filter((s) => s.type === 'PRODUCT')
                .map((s) => (
                  <option key={`p-${s.id}`} value={`PRODUCT:${s.id}`}>
                    {s.name} ({s.unitPurchase} → {s.unitStock})
                  </option>
                ))}
            </optgroup>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating((v) => !v)} disabled={disabled}>
            {creating ? 'Cancelar' : '+ Crear nuevo'}
          </Button>
        </div>

        {row.suggestion && !isMatched ? (
          <button
            type="button"
            onClick={() => selectStockable(row.suggestion!.entityType, row.suggestion!.id)}
            className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-purple-600/20 hover:bg-purple-100"
          >
            🤖 Sugerencia: {row.suggestion.name} ({Math.round(row.suggestion.score * 100)}% similar) — toca para aplicar
          </button>
        ) : null}
      </div>

      {matched ? (
        <BaseConversionPanel
          stockable={matched}
          line={row}
          disabled={disabled}
          onChange={(baseFactor) => onChange({ baseFactor })}
        />
      ) : null}

      {creating ? (
        <CreateStockableInline
          defaultName={row.descriptionRaw}
          defaultUnitPurchase={row.unit}
          invoiceUnitCost={row.unitPrice}
          invoiceUnit={row.unit}
          packUnits={row.packUnits ?? null}
          packSizePerUnit={row.packSizePerUnit ?? null}
          packSizeMeasure={row.packSizeMeasure ?? null}
          onCreated={(item) => {
            onStockableCreated(item);
            selectStockable(item.type, item.id, item);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
