'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CreateProduct, Product, UpdateProduct } from '@pos-tercos/types';
import { createProduct, deactivateProduct, updateProduct } from '../api/client';
import { formatCop as fmtCop } from '../../../lib/format';
import { marginTone } from '../../../lib/margin-thresholds';

interface ProductFormProps {
  initial?: Product;
}

interface FormState {
  name: string;
  description: string;
  basePrice: string;
  category: string;
  imageUrl: string;
  modifiersEnabled: boolean;
  isCombo: boolean;
  comboPrice: string;
  isActive: boolean;
  directResale: boolean;
  unitPurchase: string;
  unitStock: string;
  conversionFactor: string;
  thresholdMin: string;
}

export function ProductForm({ initial }: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    basePrice: initial ? String(initial.basePrice) : '',
    category: initial?.category ?? '',
    imageUrl: initial?.imageUrl ?? '',
    modifiersEnabled: initial?.modifiersEnabled ?? false,
    isCombo: initial?.isCombo ?? false,
    comboPrice:
      initial?.comboPrice !== null && initial?.comboPrice !== undefined
        ? String(initial.comboPrice)
        : '',
    isActive: initial?.isActive ?? true,
    directResale: initial?.directResale ?? false,
    unitPurchase: initial?.unitPurchase ?? '',
    unitStock: initial?.unitStock ?? '',
    conversionFactor:
      initial?.conversionFactor !== null && initial?.conversionFactor !== undefined
        ? String(initial.conversionFactor)
        : '',
    thresholdMin: initial ? String(initial.thresholdMin) : '0',
  }));

  const isEdit = Boolean(initial);
  // En edit: si el producto YA es direct-resale, los campos quedan locked
  // (cambiar conversionFactor o unitPurchase post-compras desestabilizaría
  // el cálculo de stock; por eso se inmoviliza el modelo).
  const directResaleLocked = isEdit && (initial?.directResale ?? false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const basePrice = Number(form.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setError('El precio base debe ser un número ≥ 0.');
      return;
    }

    if (form.directResale && form.isCombo) {
      setError('Un producto no puede ser direct-resale Y combo a la vez.');
      return;
    }

    let comboPriceParsed: number | null | undefined;
    if (form.isCombo) {
      const v = Number(form.comboPrice);
      if (!Number.isFinite(v) || v < 0) {
        setError('Cuando es combo, el precio del combo debe ser un número ≥ 0.');
        return;
      }
      comboPriceParsed = v;
    } else {
      comboPriceParsed = null;
    }

    // Direct-resale: parsear y validar los 4 campos como espejo del backend
    // CreateProductSchema.superRefine.
    let drFields:
      | {
          unitPurchase: string;
          unitStock: string;
          conversionFactor: number;
          thresholdMin: number;
        }
      | null = null;
    if (form.directResale) {
      const factor = Number(form.conversionFactor);
      const threshold = Number(form.thresholdMin);
      if (!form.unitPurchase.trim()) {
        setError('Cuando es reventa directa, "Unidad de compra" es requerido.');
        return;
      }
      if (!form.unitStock.trim()) {
        setError('Cuando es reventa directa, "Unidad de stock" es requerido.');
        return;
      }
      if (!Number.isFinite(factor) || factor <= 0) {
        setError('Factor de conversión debe ser un número > 0.');
        return;
      }
      if (!Number.isFinite(threshold) || threshold < 0) {
        setError('Umbral mínimo debe ser un número ≥ 0.');
        return;
      }
      drFields = {
        unitPurchase: form.unitPurchase.trim(),
        unitStock: form.unitStock.trim(),
        conversionFactor: factor,
        thresholdMin: threshold,
      };
    }

    try {
      if (isEdit && initial) {
        // En edit, NO mandamos los direct-resale fields si ya son lockeados
        // — el backend conserva los valores actuales. Solo mandamos
        // thresholdMin si cambió (y los flags no-locked).
        const update: UpdateProduct = {
          name: form.name,
          description: form.description || null,
          basePrice,
          category: form.category || null,
          imageUrl: form.imageUrl || null,
          modifiersEnabled: form.modifiersEnabled,
          isCombo: form.isCombo,
          comboPrice: comboPriceParsed,
          isActive: form.isActive,
          ...(directResaleLocked
            ? { thresholdMin: drFields?.thresholdMin ?? 0 }
            : drFields
              ? {
                  directResale: true,
                  unitPurchase: drFields.unitPurchase,
                  unitStock: drFields.unitStock,
                  conversionFactor: drFields.conversionFactor,
                  thresholdMin: drFields.thresholdMin,
                }
              : { directResale: false }),
        };
        await updateProduct(initial.id, update);
      } else {
        const create: CreateProduct = {
          name: form.name,
          description: form.description || null,
          basePrice,
          category: form.category || null,
          imageUrl: form.imageUrl || null,
          modifiersEnabled: form.modifiersEnabled,
          isCombo: form.isCombo,
          comboPrice: comboPriceParsed,
          ...(drFields
            ? {
                directResale: true,
                unitPurchase: drFields.unitPurchase,
                unitStock: drFields.unitStock,
                conversionFactor: drFields.conversionFactor,
                thresholdMin: drFields.thresholdMin,
              }
            : {}),
        };
        await createProduct(create);
      }
      startTransition(() => {
        router.push('/products');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    if (!window.confirm(`¿Desactivar el producto "${initial.name}"?`)) return;
    setError(null);
    try {
      await deactivateProduct(initial.id);
      startTransition(() => {
        router.push('/products');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          required
          maxLength={120}
          disabled={pending}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Hamburguesa Nashville, Combo Familiar…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <textarea
          id="description"
          maxLength={500}
          rows={3}
          disabled={pending}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
          placeholder="Descripción opcional para el menú."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="basePrice">Precio base (COP)</Label>
          <Input
            id="basePrice"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            disabled={pending}
            value={form.basePrice}
            onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
            placeholder="18000"
          />
          <p className="text-xs text-gray-500">
            Precio de <strong>venta</strong> al cliente. No es el costo de compra.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            maxLength={60}
            disabled={pending}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Hamburguesas, Bebidas, Acompañamientos…"
          />
        </div>
      </div>

      {isEdit && initial?.directResale && (
        <CostInfoPanel product={initial} basePriceInput={form.basePrice} />
      )}

      <div className="space-y-2">
        <Label htmlFor="imageUrl">URL de imagen</Label>
        <Input
          id="imageUrl"
          type="url"
          maxLength={500}
          disabled={pending}
          value={form.imageUrl}
          onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          placeholder="https://…"
        />
      </div>

      <DirectResaleSection
        form={form}
        setForm={setForm}
        pending={pending}
        directResaleLocked={directResaleLocked}
      />

      <fieldset className="space-y-3 rounded-md border border-gray-200 p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Configuración
        </legend>

        <div className="flex items-center gap-2">
          <input
            id="modifiersEnabled"
            type="checkbox"
            disabled={pending}
            checked={form.modifiersEnabled}
            onChange={(e) => setForm((f) => ({ ...f, modifiersEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="modifiersEnabled">
            Permite modificadores (sin queso, agregar tocino, etc.)
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isCombo"
            type="checkbox"
            disabled={pending || form.directResale}
            checked={form.isCombo}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                isCombo: e.target.checked,
                comboPrice: e.target.checked ? f.comboPrice : '',
              }))
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="isCombo">
            Es un combo (incluye otros productos)
            {form.directResale ? (
              <span className="ml-2 text-xs text-gray-500">— deshabilitado: ya es reventa directa</span>
            ) : null}
          </Label>
        </div>

        {form.isCombo && (
          <div className="space-y-2 pl-6">
            <Label htmlFor="comboPrice">Precio del combo (COP)</Label>
            <Input
              id="comboPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              disabled={pending}
              value={form.comboPrice}
              onChange={(e) => setForm((f) => ({ ...f, comboPrice: e.target.value }))}
              placeholder="35000"
            />
            <p className="text-xs text-gray-500">
              Precio total del combo (típicamente con descuento sobre la suma de componentes).
            </p>
          </div>
        )}

        {isEdit && (
          <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
            <input
              id="isActive"
              type="checkbox"
              disabled={pending}
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="isActive">Activo</Label>
          </div>
        )}
      </fieldset>

      {!isEdit && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Las variantes (tamaños), modificadores específicos y componentes del combo se gestionan en
          una pantalla dedicada (próximamente). La receta se asigna después de crear el producto.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeactivate}
            disabled={pending}
          >
            Desactivar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/products')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DirectResaleSection({
  form,
  setForm,
  pending,
  directResaleLocked,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
  directResaleLocked: boolean;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-gray-200 p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <Label htmlFor="directResale">
            Es producto de <strong>reventa directa</strong>
          </Label>
          <p className="mt-0.5 text-xs text-gray-500">
            Marcar para productos que se venden tal como se compran (Coca-Cola, snacks, papas
            empacadas). Se descontará stock al cobrar — no usa receta.
          </p>
          {directResaleLocked ? (
            <p className="mt-1 text-xs text-amber-700">
              ⚠ Este flag NO se puede desactivar porque cambiaría el modelo de stock del producto
              (rompería conversiones históricas).
            </p>
          ) : null}
        </div>
      </div>

      {form.directResale && (
        <div className="space-y-3 pl-6 pt-2">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Costo ≠ Precio.</strong> El <code>basePrice</code> es lo que cobrás al cliente.
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
              <p className="text-[10px] text-gray-500">Cómo viene del proveedor.</p>
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
              <p className="text-[10px] text-gray-500">Cómo lo vendés al cliente.</p>
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
              <p className="text-[10px] text-gray-500">
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
              <p className="text-[10px] text-gray-500">
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

/**
 * Bloque de costo histórico para productos direct-resale. Es read-only:
 * `lastUnitCost` se actualiza automáticamente al confirmar facturas.
 * Calcula margen vs `basePrice` que el dueño está editando.
 */
function CostInfoPanel({
  product,
  basePriceInput,
}: {
  product: Product;
  basePriceInput: string;
}) {
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
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <p className="font-medium">Sin costo histórico aún</p>
        <p className="mt-1 text-xs text-amber-800">
          Este producto se creó como reventa directa, pero todavía no se cargó en ninguna factura
          confirmada. Una vez registres una factura con este producto, vas a ver acá su último
          costo y el margen sobre el precio de venta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Costo histórico (read-only)
        </p>
        {date && (
          <span className="text-xs text-gray-500">
            actualizado {new Date(date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={`Costo por ${unitPurchase || 'unidad compra'}`}
          value={formatCop(cost)}
        />
        <Stat
          label={`Costo por ${unitStock || 'unidad venta'}`}
          value={costPerStock !== null ? formatCop(costPerStock) : '—'}
          hint={
            factor
              ? `÷ factor ${factor}`
              : 'Falta conversionFactor para calcular costo por unidad de venta'
          }
        />
        <Stat
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

      <p className="text-xs text-gray-500">
        El costo se actualiza automáticamente cada vez que confirmás una factura con este producto.
        El margen se recalcula en vivo según el precio de venta que estás editando arriba.
      </p>
    </div>
  );
}

function Stat({
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
      ? 'text-green-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-gray-900';
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-gray-200">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function formatCop(amount: number): string {
  return fmtCop(amount);
}
