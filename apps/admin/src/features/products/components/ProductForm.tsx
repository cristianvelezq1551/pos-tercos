'use client';

import { Button, ConfirmDialog, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Product } from '@pos-tercos/types';
import {
  createProduct,
  deactivateProduct,
  setComboComponents,
  setProductOptions,
  updateProduct,
} from '../api/client';
import { kindFromFlags, type FormState, type ProductKind } from './ProductFormTypes';
import {
  parseFormValues,
  buildCreatePayload,
  buildUpdatePayload,
} from './ProductFormSubmitLogic';
import { ProductTypeSelector } from './ProductTypeSelector';
import { ProductFormBasicFields } from './ProductFormBasicFields';
import { ProductFormImageField } from './ProductFormImageField';
import { ProductFormDirectResaleSection } from './ProductFormDirectResaleSection';
import { ProductFormVariantsSection } from './ProductFormVariantsSection';
import { ProductFormExtrasSection } from './ProductFormExtrasSection';
import { ProductFormComboSection } from './ProductFormComboSection';
import { ProductFormCostInfoPanel } from './ProductFormCostInfoPanel';
import { ProductFormPreparedCostPanel } from './ProductFormPreparedCostPanel';

interface ProductFormProps {
  initial?: Product;
  /** Productos elegibles como componentes de combo (activos, no combos). */
  comboCandidates?: Product[];
}

function initFormState(initial?: Product): FormState {
  const base = initial?.basePrice ?? 0;
  return {
    kind: initial ? kindFromFlags(initial) : 'simple',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    preparationSteps: initial?.preparationSteps ?? [],
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
    sizes: (initial?.sizes ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      price: String(base + s.priceModifier),
    })),
    modifiers: (initial?.modifiers ?? []).map((m) => {
      const consumption = m.recipeDelta?.[0];
      return {
        name: m.name,
        priceDelta: String(m.priceDelta),
        consumeChildType: consumption?.childType ?? ('' as const),
        consumeChildId: consumption?.childId ?? '',
        consumeQty: consumption ? String(consumption.quantity) : '',
      };
    }),
    comboComponents: (initial?.comboComponents ?? []).map((c) => ({
      productId: c.productId,
      quantity: String(c.quantity),
    })),
  };
}

export function ProductForm({ initial, comboCandidates = [] }: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [form, setForm] = useState<FormState>(() => initFormState(initial));

  const isEdit = Boolean(initial);
  const directResaleLocked = isEdit && (initial?.directResale ?? false);
  const candidates = comboCandidates.filter((p) => !p.isCombo && p.id !== initial?.id);

  // El tipo elegido deriva los flags + siembra una fila guía en variantes/combo.
  const setKind = (kind: ProductKind) =>
    setForm((f) => ({
      ...f,
      kind,
      directResale: kind === 'drink',
      isCombo: kind === 'combo',
      sizes: kind === 'variants' && f.sizes.length === 0 ? [{ name: '', price: '' }] : f.sizes,
      comboComponents:
        kind === 'combo' && f.comboComponents.length === 0
          ? [{ productId: '', quantity: '1' }]
          : f.comboComponents,
    }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFormValues(form);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    try {
      if (isEdit && initial) {
        await updateProduct(initial.id, buildUpdatePayload(form, parsed, directResaleLocked));
        // Variantes/extras/combo se editan por endpoints dedicados.
        if (form.kind === 'combo') {
          await setComboComponents(initial.id, { components: parsed.comboComponents });
        } else if (form.kind === 'simple' || form.kind === 'variants') {
          await setProductOptions(initial.id, {
            sizes: parsed.sizes.map((s) => ({
              ...(s.id ? { id: s.id } : {}),
              name: s.name,
              priceModifier: s.priceModifier,
            })),
            modifiers: parsed.modifiers,
          });
        }
      } else {
        await createProduct(buildCreatePayload(form, parsed));
      }
      startTransition(() => {
        router.push('/products');
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
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
    <>
      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-border bg-card p-6">
        <ProductTypeSelector
          value={form.kind}
          onChange={setKind}
          disabled={pending || isEdit}
        />

        <ProductFormBasicFields form={form} setForm={setForm} pending={pending} />

        {isEdit && initial?.directResale && (
          <ProductFormCostInfoPanel product={initial} basePriceInput={form.basePrice} />
        )}

        {isEdit && initial && !initial.directResale && !initial.isCombo && (
          <ProductFormPreparedCostPanel productId={initial.id} basePriceInput={form.basePrice} />
        )}

        <ProductFormImageField
          imageUrl={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
          disabled={pending}
        />

        {form.kind === 'drink' && (
          <ProductFormDirectResaleSection
            form={form}
            setForm={setForm}
            pending={pending}
            directResaleLocked={directResaleLocked}
            hideToggle
          />
        )}

        {form.kind === 'variants' && (
          <ProductFormVariantsSection form={form} setForm={setForm} pending={pending} />
        )}

        {(form.kind === 'simple' || form.kind === 'variants') && (
          <ProductFormExtrasSection form={form} setForm={setForm} pending={pending} />
        )}

        {form.kind === 'combo' && (
          <ProductFormComboSection
            form={form}
            setForm={setForm}
            pending={pending}
            candidates={candidates}
          />
        )}

        {isEdit && (
          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              disabled={pending}
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            <Label htmlFor="isActive">Activo (visible en el catálogo)</Label>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {isEdit ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeactivate(true)}
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

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={async () => {
          setConfirmDeactivate(false);
          await handleDeactivate();
        }}
        title="¿Desactivar producto?"
        description={`Vas a desactivar "${initial?.name ?? ''}". No se borra del histórico.`}
        confirmLabel="Sí, desactivar"
        destructive
        pending={pending}
      />
    </>
  );
}
