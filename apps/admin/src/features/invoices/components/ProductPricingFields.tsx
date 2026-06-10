'use client';

import { Input, Label, MoneyInput, formatCop } from '@pos-tercos/ui';

interface ProductPricingFieldsProps {
  invoiceUnitCost: number;
  unitPurchase: string;
  unitStock: string;
  conversionFactor: string;
  basePrice: string;
  onBasePriceChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  disabled?: boolean;
}

export function ProductPricingFields({
  invoiceUnitCost,
  unitPurchase,
  unitStock,
  conversionFactor,
  basePrice,
  onBasePriceChange,
  category,
  onCategoryChange,
  disabled,
}: ProductPricingFieldsProps) {
  return (
    <>
      <div className="col-span-full rounded-md border border-warning-border bg-warning-bg/30 p-2.5 text-xs text-warning">
        <p className="font-semibold">⚠️ El costo y el precio de venta son distintos:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            <strong>Costo:</strong> {invoiceUnitCost > 0 ? `~${formatCop(invoiceUnitCost)} por ${unitPurchase || 'unidad-compra'} (de la factura)` : 'lo que pagas al proveedor (de la factura)'}.
            Se guarda automáticamente al confirmar.
          </li>
          <li>
            <strong>Precio de venta:</strong> lo que cobras al cliente final. Definilo abajo.
          </li>
        </ul>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cs-bp">💰 Precio de venta al cliente (COP)</Label>
        <MoneyInput
          id="cs-bp"
          disabled={disabled}
          value={basePrice}
          onChange={onBasePriceChange}
          placeholder="3.500"
        />
        {basePrice && invoiceUnitCost > 0 && Number(conversionFactor) > 0 && (
          <p className="text-xs text-muted-foreground">
            Margen estimado por {unitStock || 'unidad'}:{' '}
            <span className="font-mono font-semibold text-success">
              {formatCop(Number(basePrice) - invoiceUnitCost / Number(conversionFactor))}
            </span>
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cs-cat">Categoría</Label>
        <Input id="cs-cat" disabled={disabled} value={category} onChange={(e) => onCategoryChange(e.target.value)} placeholder="Bebidas, Snacks…" />
      </div>
    </>
  );
}
