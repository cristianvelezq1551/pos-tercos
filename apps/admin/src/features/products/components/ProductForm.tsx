'use client';

import { Button, ConfirmDialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Product } from '@pos-tercos/types';
import { createProduct, deactivateProduct, updateProduct } from '../api/client';
import type { FormState } from './ProductFormTypes';
import { parseFormValues, buildCreatePayload, buildUpdatePayload } from './ProductFormSubmitLogic';
import { ProductFormBasicFields } from './ProductFormBasicFields';
import { ProductFormImageField } from './ProductFormImageField';
import { ProductFormDirectResaleSection } from './ProductFormDirectResaleSection';
import { ProductFormCostInfoPanel } from './ProductFormCostInfoPanel';
import { ProductFormConfigSection } from './ProductFormConfigSection';

interface ProductFormProps {
  initial?: Product;
}

export function ProductForm({ initial }: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
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

    const parsed = parseFormValues(form);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const { basePrice, comboPriceParsed, drFields } = parsed;

    try {
      if (isEdit && initial) {
        await updateProduct(
          initial.id,
          buildUpdatePayload(form, basePrice, comboPriceParsed, drFields, directResaleLocked),
        );
      } else {
        await createProduct(buildCreatePayload(form, basePrice, comboPriceParsed, drFields));
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
      <ProductFormBasicFields form={form} setForm={setForm} pending={pending} />

      {isEdit && initial?.directResale && (
        <ProductFormCostInfoPanel product={initial} basePriceInput={form.basePrice} />
      )}

      <ProductFormImageField
        imageUrl={form.imageUrl}
        onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
        disabled={pending}
      />

      <ProductFormDirectResaleSection
        form={form}
        setForm={setForm}
        pending={pending}
        directResaleLocked={directResaleLocked}
      />

      <ProductFormConfigSection
        form={form}
        setForm={setForm}
        pending={pending}
        isEdit={isEdit}
      />

      {!isEdit && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Las variantes (tamaños), modificadores específicos y componentes del combo se gestionan en
          una pantalla dedicada (próximamente). La receta se asigna después de crear el producto.
        </p>
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
