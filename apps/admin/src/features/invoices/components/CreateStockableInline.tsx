'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useState } from 'react';
import type { Stockable, StockableType } from '@pos-tercos/types';
import { createIngredient } from '../../ingredients';
import { createProduct } from '../../products';
import { StockableTypeSelector } from './StockableTypeSelector';
import { ProductPricingFields } from './ProductPricingFields';

interface CreateStockableInlineProps {
  defaultName: string;
  defaultUnitPurchase: string;
  /** Costo unitario detectado en la factura (NO se prefilla en basePrice — son precios distintos). */
  invoiceUnitCost: number;
  /** Unidad declarada en la línea de factura (kg, caja, etc.). Usada para
   *  validar coherencia con unitPurchase del nuevo stockable (FASE 4 ajustes 2.11). */
  invoiceUnit: string;
  onCreated: (item: Stockable) => void;
  onCancel: () => void;
}

export function CreateStockableInline({
  defaultName,
  defaultUnitPurchase,
  invoiceUnitCost,
  invoiceUnit,
  onCreated,
  onCancel,
}: CreateStockableInlineProps) {
  const [type, setType] = useState<StockableType>('INGREDIENT');
  const [name, setName] = useState(defaultName);
  const [unitPurchase, setUnitPurchase] = useState(defaultUnitPurchase || 'kg');
  const [unitStock, setUnitStock] = useState(defaultUnitPurchase || 'g');
  const [conversionFactor, setConversionFactor] = useState('1');
  const [thresholdMin, setThresholdMin] = useState('0');
  // ⚠️ basePrice = PRECIO DE VENTA (al cliente). NO se prefilla con el
  // costo de factura — son precios diferentes. Lo define el dueño.
  const [basePrice, setBasePrice] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    setErr(null);
    const factor = Number(conversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) { setErr('El factor debe ser positivo.'); return; }
    const threshold = Number(thresholdMin);
    if (!Number.isFinite(threshold) || threshold < 0) { setErr('Mínimo de alerta inválido.'); return; }

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
          setErr('Precio base inválido (requerido para productos de reventa directa).');
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
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Crear nuevo (se asocia automáticamente a esta línea)
      </p>

      <StockableTypeSelector value={type} onChange={setType} disabled={submitting} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cs-name">Nombre</Label>
          <Input id="cs-name" disabled={submitting} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cs-up">Unidad compra</Label>
            <Input id="cs-up" disabled={submitting} value={unitPurchase} onChange={(e) => setUnitPurchase(e.target.value)} placeholder="kg, caja" />
            {unitPurchase.trim().length > 0 &&
            invoiceUnit.trim().length > 0 &&
            unitPurchase.trim().toLowerCase() !== invoiceUnit.trim().toLowerCase() ? (
              <p className="text-[10px] text-warning">
                ⚠ La factura declara la cantidad en{' '}
                <strong>{invoiceUnit}</strong> pero estás creando con unidad de compra{' '}
                <strong>{unitPurchase}</strong>. Asegúrate de que el factor refleje la
                conversión real (ej. 1 caja = 10 kg → factor 10) o el inventario quedará mal.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-us">Unidad de inventario</Label>
            <Input id="cs-us" disabled={submitting} value={unitStock} onChange={(e) => setUnitStock(e.target.value)} placeholder="g, unidad" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-cf">Factor (1 de compra = N de inventario)</Label>
          <Input id="cs-cf" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={conversionFactor} onChange={(e) => setConversionFactor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-th">Mínimo de alerta</Label>
          <Input id="cs-th" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={thresholdMin} onChange={(e) => setThresholdMin(e.target.value)} />
        </div>
        {type === 'PRODUCT' && (
          <ProductPricingFields
            invoiceUnitCost={invoiceUnitCost}
            unitPurchase={unitPurchase}
            unitStock={unitStock}
            conversionFactor={conversionFactor}
            basePrice={basePrice}
            onBasePriceChange={setBasePrice}
            category={category}
            onCategoryChange={setCategory}
            disabled={submitting}
          />
        )}
      </div>

      {err && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">{err}</p>
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
