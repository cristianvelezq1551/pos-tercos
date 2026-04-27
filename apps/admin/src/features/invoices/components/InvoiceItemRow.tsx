'use client';

import { Button, Input, Label, cn } from '@pos-tercos/ui';
import { useState } from 'react';
import type { Stockable, StockableType } from '@pos-tercos/types';
import { createIngredient } from '../../ingredients';
import { createProduct } from '../../products';

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
        isMatched ? 'border-green-200 bg-green-50/30' : 'border-amber-300 bg-amber-50/30',
      )}
    >
      <div className="flex items-start gap-2 text-xs">
        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 font-mono text-[10px] font-semibold text-gray-700">
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
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                  ✓ Asociado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                  ⚠ Sin asociar
                </span>
              )}
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
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
            <NumField id={`price-${row.localId}`} label="Precio unit." value={row.unitPrice} onChange={(v) => onChange({ unitPrice: v })} disabled={disabled} />
            <NumField id={`total-${row.localId}`} label="Total" value={row.total} onChange={(v) => onChange({ total: v })} disabled={disabled} />
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
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="">— Seleccionar —</option>
                <optgroup label="🌾 Insumos (entran en recetas)">
                  {stockables
                    .filter((s) => s.type === 'INGREDIENT')
                    .map((s) => (
                      <option key={`i-${s.id}`} value={`INGREDIENT:${s.id}`}>
                        {s.name} ({s.unitPurchase} → {s.unitStock})
                      </option>
                    ))}
                </optgroup>
                <optgroup label="📦 Productos direct-resale (se venden tal cual)">
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
                className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20 hover:bg-purple-100"
              >
                🤖 Sugerencia: {row.suggestion.name} ({Math.round(row.suggestion.score * 100)}% similar) — click para aplicar
              </button>
            )}
          </div>

          {creating && (
            <CreateStockableInline
              defaultName={row.descriptionRaw}
              defaultUnitPurchase={row.unit}
              defaultUnitPrice={row.unitPrice}
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

function NumField({ id, label, value, onChange, disabled }: { id: string; label: string; value: number; onChange: (v: number) => void; disabled?: boolean; }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseNum(e.target.value))}
      />
    </div>
  );
}

function parseNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface CreateStockableInlineProps {
  defaultName: string;
  defaultUnitPurchase: string;
  defaultUnitPrice: number;
  onCreated: (item: Stockable) => void;
  onCancel: () => void;
}

function CreateStockableInline({ defaultName, defaultUnitPurchase, defaultUnitPrice, onCreated, onCancel }: CreateStockableInlineProps) {
  const [type, setType] = useState<StockableType>('INGREDIENT');
  const [name, setName] = useState(defaultName);
  const [unitPurchase, setUnitPurchase] = useState(defaultUnitPurchase || 'kg');
  const [unitStock, setUnitStock] = useState(defaultUnitPurchase || 'g');
  const [conversionFactor, setConversionFactor] = useState('1');
  const [thresholdMin, setThresholdMin] = useState('0');
  const [basePrice, setBasePrice] = useState(defaultUnitPrice ? String(defaultUnitPrice) : '');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    setErr(null);
    const factor = Number(conversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      setErr('El factor debe ser positivo.');
      return;
    }
    const threshold = Number(thresholdMin);
    if (!Number.isFinite(threshold) || threshold < 0) {
      setErr('Threshold inválido.');
      return;
    }

    setSubmitting(true);
    try {
      if (type === 'INGREDIENT') {
        const created = await createIngredient({
          name: name.trim(),
          unitPurchase: unitPurchase.trim(),
          unitRecipe: unitStock.trim(),
          conversionFactor: factor,
          thresholdMin: threshold,
        });
        onCreated({
          type: 'INGREDIENT',
          id: created.id,
          name: created.name,
          unitStock: created.unitRecipe,
          unitPurchase: created.unitPurchase,
          conversionFactor: created.conversionFactor,
          thresholdMin: created.thresholdMin,
          isActive: created.isActive,
          currentStock: 0,
          lowStock: false,
          category: null,
          basePrice: null,
        });
      } else {
        const priceNum = Number(basePrice);
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          setErr('Precio base inválido (requerido para productos direct-resale).');
          setSubmitting(false);
          return;
        }
        const created = await createProduct({
          name: name.trim(),
          basePrice: priceNum,
          category: category.trim() || null,
          directResale: true,
          unitPurchase: unitPurchase.trim(),
          unitStock: unitStock.trim(),
          conversionFactor: factor,
          thresholdMin: threshold,
        });
        onCreated({
          type: 'PRODUCT',
          id: created.id,
          name: created.name,
          unitStock: created.unitStock ?? 'unidad',
          unitPurchase: created.unitPurchase ?? 'unidad',
          conversionFactor: created.conversionFactor ?? 1,
          thresholdMin: created.thresholdMin,
          isActive: created.isActive,
          currentStock: 0,
          lowStock: false,
          category: created.category,
          basePrice: created.basePrice,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
        Crear nuevo (se asocia automáticamente a esta línea)
      </p>

      <div className="flex gap-3 text-sm">
        <label className={cn('flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors', type === 'INGREDIENT' ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white hover:bg-gray-50')}>
          <input type="radio" name="stk-type" checked={type === 'INGREDIENT'} onChange={() => setType('INGREDIENT')} disabled={submitting} className="mt-0.5 h-4 w-4 text-emerald-600" />
          <span>
            <span className="block font-medium text-gray-900">🌾 Insumo</span>
            <span className="text-xs text-gray-600">Entra en recetas (pollo, harina, sal)</span>
          </span>
        </label>
        <label className={cn('flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors', type === 'PRODUCT' ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 bg-white hover:bg-gray-50')}>
          <input type="radio" name="stk-type" checked={type === 'PRODUCT'} onChange={() => setType('PRODUCT')} disabled={submitting} className="mt-0.5 h-4 w-4 text-blue-600" />
          <span>
            <span className="block font-medium text-gray-900">📦 Producto direct-resale</span>
            <span className="text-xs text-gray-600">Comprado y vendido tal cual (Coca-Cola)</span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cs-name">Nombre</Label>
          <Input id="cs-name" disabled={submitting} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cs-up">Unidad compra</Label>
            <Input id="cs-up" disabled={submitting} value={unitPurchase} onChange={(e) => setUnitPurchase(e.target.value)} placeholder="kg, caja" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-us">Unidad stock</Label>
            <Input id="cs-us" disabled={submitting} value={unitStock} onChange={(e) => setUnitStock(e.target.value)} placeholder="g, unidad" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-cf">Factor (1 compra = N stock)</Label>
          <Input id="cs-cf" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={conversionFactor} onChange={(e) => setConversionFactor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-th">Threshold (alerta)</Label>
          <Input id="cs-th" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={thresholdMin} onChange={(e) => setThresholdMin(e.target.value)} />
        </div>
        {type === 'PRODUCT' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="cs-bp">Precio venta (COP)</Label>
              <Input id="cs-bp" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="3500" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-cat">Categoría</Label>
              <Input id="cs-cat" disabled={submitting} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bebidas, Snacks…" />
            </div>
          </>
        )}
      </div>

      {err && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{err}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="button" size="sm" onClick={handleCreate} disabled={submitting}>
          {submitting ? 'Creando…' : `Crear ${type === 'INGREDIENT' ? 'insumo' : 'producto'} y asociar`}
        </Button>
      </div>
    </div>
  );
}
