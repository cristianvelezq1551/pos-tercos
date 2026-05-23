'use client';

import { Button, Input, Label, cn } from '@pos-tercos/ui';
import { useState } from 'react';
import type { Stockable, StockableType } from '@pos-tercos/types';
import { CreateStockableInline } from './CreateStockableInline';
import { NumField } from './NumField';

export interface DraftRow {
  localId: string;
  selection: { entityType: StockableType; id: string } | null;
  descriptionRaw: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  suggestion?: { entityType: StockableType; id: string; name: string; score: number } | null;
}

interface InvoiceItemRowProps {
  index: number;
  row: DraftRow;
  stockables: Stockable[];
  disabled?: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onStockableCreated: (item: Stockable) => void;
}

export function InvoiceItemRow({
  index,
  row,
  stockables,
  disabled,
  onChange,
  onRemove,
  onStockableCreated,
}: InvoiceItemRowProps) {
  const [creating, setCreating] = useState(false);
  const isMatched = row.selection !== null;
  const dropdownValue = row.selection
    ? `${row.selection.entityType}:${row.selection.id}`
    : '';

  const applySuggestion = (): void => {
    if (!row.suggestion) return;
    onChange({
      selection: { entityType: row.suggestion.entityType, id: row.suggestion.id },
    });
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isMatched ? 'border-success-border bg-success-bg/30' : 'border-warning-border bg-warning-bg/30',
      )}
    >
      <div className="flex items-start gap-2 text-xs">
        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-[10px] font-semibold text-foreground">
          {index}
        </span>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${row.localId}`}>Descripción tal como aparece en factura</Label>
              <Input
                id={`desc-${row.localId}`}
                disabled={disabled}
                value={row.descriptionRaw}
                onChange={(e) => onChange({ descriptionRaw: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              {isMatched ? (
                <span className="inline-flex items-center rounded-full bg-success-bg px-2 py-1 text-xs font-medium text-success">
                  ✓ Asociado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-warning-bg px-2 py-1 text-xs font-medium text-warning">
                  ⚠ Sin asociar
                </span>
              )}
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="rounded-md p-1.5 text-red-500 hover:bg-destructive/10"
                aria-label="Quitar fila"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField id={`qty-${row.localId}`} label="Cantidad" value={row.quantity} onChange={(v) => onChange({ quantity: v })} disabled={disabled} />
            <div className="space-y-1.5">
              <Label htmlFor={`unit-${row.localId}`}>Unidad</Label>
              <Input
                id={`unit-${row.localId}`}
                disabled={disabled}
                value={row.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder="kg, lt, unidad, caja"
              />
            </div>
            <NumField id={`price-${row.localId}`} label="Costo unit." value={row.unitPrice} onChange={(v) => onChange({ unitPrice: v })} disabled={disabled} />
            <NumField id={`total-${row.localId}`} label="Total costo" value={row.total} onChange={(v) => onChange({ total: v })} disabled={disabled} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`stk-${row.localId}`}>Asociar a Insumo o Producto del catálogo</Label>
            <div className="flex gap-2">
              <select
                id={`stk-${row.localId}`}
                value={dropdownValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    onChange({ selection: null });
                  } else {
                    const [entityType, id] = v.split(':') as [StockableType, string];
                    onChange({ selection: { entityType, id } });
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
                <optgroup label="Productos direct-resale (se venden tal cual)">
                  {stockables
                    .filter((s) => s.type === 'PRODUCT')
                    .map((s) => (
                      <option key={`p-${s.id}`} value={`PRODUCT:${s.id}`}>
                        {s.name} ({s.unitPurchase} → {s.unitStock})
                      </option>
                    ))}
                </optgroup>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreating((v) => !v)}
                disabled={disabled}
              >
                {creating ? 'Cancelar' : '+ Crear nuevo'}
              </Button>
            </div>

            {row.suggestion && !isMatched && (
              <button
                type="button"
                onClick={applySuggestion}
                className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-purple-600/20 hover:bg-purple-100"
              >
                🤖 Sugerencia: {row.suggestion.name} ({Math.round(row.suggestion.score * 100)}% similar) — click para aplicar
              </button>
            )}
          </div>

          {creating && (
            <CreateStockableInline
              defaultName={row.descriptionRaw}
              defaultUnitPurchase={row.unit}
              invoiceUnitCost={row.unitPrice}
              invoiceUnit={row.unit}
              onCreated={(item) => {
                onStockableCreated(item);
                onChange({ selection: { entityType: item.type, id: item.id } });
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

