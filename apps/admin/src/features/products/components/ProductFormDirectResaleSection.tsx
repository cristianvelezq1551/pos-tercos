'use client';

import { Input, Label } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';

interface ProductFormDirectResaleSectionProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
  directResaleLocked: boolean;
}

export function ProductFormDirectResaleSection({
  form,
  setForm,
  pending,
  directResaleLocked,
}: ProductFormDirectResaleSectionProps) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reventa directa
      </legend>

      <div className="flex items-start gap-2">
        <input
          id="directResale"
          type="checkbox"
          disabled={pending || directResaleLocked || form.isCombo}
          checked={form.directResale}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              directResale: e.target.checked,
              ...(e.target.checked ? { isCombo: false, comboPrice: '' } : {}),
            }))
          }
          className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <div>
          <Label htmlFor="directResale">
            Es producto de <strong>reventa directa</strong>
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Marcar para productos que se venden tal como se compran (Coca-Cola, snacks, papas
            empacadas). Se descontará stock al cobrar — no usa receta.
          </p>
          {directResaleLocked ? (
            <p className="mt-1 text-xs text-warning">
              ⚠ Este flag NO se puede desactivar porque cambiaría el modelo de stock del producto
              (rompería conversiones históricas).
            </p>
          ) : null}
        </div>
      </div>

      {form.directResale && (
        <div className="space-y-3 pl-6 pt-2">
          <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            <strong>Costo ≠ Precio.</strong> El <code>basePrice</code> es lo que cobras al cliente.
            El costo histórico se actualiza solo al confirmar facturas con este producto.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitPurchase">Unidad de compra</Label>
              <Input
                id="unitPurchase"
                required
                maxLength={20}
                disabled={pending || directResaleLocked}
                value={form.unitPurchase}
                onChange={(e) => setForm((f) => ({ ...f, unitPurchase: e.target.value }))}
                placeholder="caja, six-pack, bulto"
              />
              <p className="text-[10px] text-muted-foreground">Cómo viene del proveedor.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitStock">Unidad de venta</Label>
              <Input
                id="unitStock"
                required
                maxLength={20}
                disabled={pending || directResaleLocked}
                value={form.unitStock}
                onChange={(e) => setForm((f) => ({ ...f, unitStock: e.target.value }))}
                placeholder="botella, lata, unidad"
              />
              <p className="text-[10px] text-muted-foreground">Cómo lo vendés al cliente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conversionFactor">Factor de conversión</Label>
              <Input
                id="conversionFactor"
                type="number"
                inputMode="decimal"
                step="any"
                min="0.01"
                required
                disabled={pending || directResaleLocked}
                value={form.conversionFactor}
                onChange={(e) => setForm((f) => ({ ...f, conversionFactor: e.target.value }))}
                placeholder="24"
              />
              <p className="text-[10px] text-muted-foreground">
                Cuántas <em>{form.unitStock || 'unidades de venta'}</em> hay en{' '}
                <em>1 {form.unitPurchase || 'unidad de compra'}</em>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="thresholdMin">Umbral mínimo (alerta)</Label>
              <Input
                id="thresholdMin"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                disabled={pending}
                value={form.thresholdMin}
                onChange={(e) => setForm((f) => ({ ...f, thresholdMin: e.target.value }))}
                placeholder="12"
              />
              <p className="text-[10px] text-muted-foreground">
                En <em>{form.unitStock || 'unidades de venta'}</em>. Cuando el stock baja de acá,
                aparece alerta.
              </p>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
