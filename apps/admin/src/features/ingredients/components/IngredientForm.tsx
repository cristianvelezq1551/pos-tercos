'use client';

import {
  Button,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  NumberInput,
} from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { UNIT_LABEL_ERROR, isValidUnitLabel, type Ingredient } from '@pos-tercos/types';
import { createIngredient, deactivateIngredient, updateIngredient } from '../api/client';

interface IngredientFormProps {
  initial?: Ingredient;
}

interface FormState {
  name: string;
  unitPurchase: string;
  unitRecipe: string;
  conversionFactor: number | null;
  thresholdMin: number | null;
  portionSize: number | null;
  blocksAvailability: boolean;
  isActive: boolean;
}

export function IngredientForm({ initial }: IngredientFormProps) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  // `submitting` cubre la llamada de red (useTransition NO la cubre: el await
  // corre fuera de startTransition, y sin esto un doble-click creaba
  // duplicados con red lenta).
  const [submitting, setSubmitting] = useState(false);
  const pending = transitionPending || submitting;
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    unitPurchase: initial?.unitPurchase ?? '',
    unitRecipe: initial?.unitRecipe ?? '',
    conversionFactor: initial?.conversionFactor ?? null,
    thresholdMin: initial?.thresholdMin ?? 0,
    portionSize: initial?.portionSize ?? null,
    blocksAvailability: initial?.blocksAvailability ?? true,
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    if (form.conversionFactor === null || form.conversionFactor <= 0) {
      setError('El factor de conversión debe ser un número positivo.');
      return;
    }
    if (form.thresholdMin === null || form.thresholdMin < 0) {
      setError('El mínimo de alerta debe ser un número ≥ 0.');
      return;
    }
    if (form.portionSize !== null && form.portionSize <= 0) {
      setError('El tamaño de porción debe ser mayor a 0 (o dejarse vacío).');
      return;
    }
    if (!isValidUnitLabel(form.unitPurchase) || !isValidUnitLabel(form.unitRecipe)) {
      setError(UNIT_LABEL_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && initial) {
        await updateIngredient(initial.id, {
          name: form.name,
          unitPurchase: form.unitPurchase,
          unitRecipe: form.unitRecipe,
          conversionFactor: form.conversionFactor,
          thresholdMin: form.thresholdMin,
          portionSize: form.portionSize,
          blocksAvailability: form.blocksAvailability,
          isActive: form.isActive,
        });
      } else {
        await createIngredient({
          name: form.name,
          unitPurchase: form.unitPurchase,
          unitRecipe: form.unitRecipe,
          conversionFactor: form.conversionFactor,
          thresholdMin: form.thresholdMin,
          portionSize: form.portionSize,
          blocksAvailability: form.blocksAvailability,
        });
      }
      startTransition(() => {
        router.push('/ingredients');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!initial || pending) return;
    setError(null);
    setSubmitting(true);
    try {
      await deactivateIngredient(initial.id);
      startTransition(() => {
        router.push('/ingredients');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
      setConfirmDeactivate(false);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-border bg-card p-6"
      >
        <FormField label="Nombre" required>
          <Input
            required
            maxLength={120}
            disabled={pending}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Pollo crudo, Sal, Pan brioche…"
          />
        </FormField>

        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Compras en una unidad (bulto, caja, litro) pero cocinas en otra (g, ml). El{' '}
          <strong>factor</strong> conecta las dos para costear recetas y descontar stock. Ej: un
          bulto de sal de 1.000 g → unidad de compra <em>bulto</em>, unidad de receta <em>g</em>,
          factor <em>1000</em>.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Unidad de compra" hint="Unidad como se compra al proveedor." required>
            <Input
              required
              maxLength={20}
              disabled={pending}
              value={form.unitPurchase}
              onChange={(e) => setForm((f) => ({ ...f, unitPurchase: e.target.value }))}
              placeholder="kg, lt, caja"
            />
          </FormField>

          <FormField label="Unidad de receta" hint="Unidad como la consume la receta." required>
            <Input
              required
              maxLength={20}
              disabled={pending}
              value={form.unitRecipe}
              onChange={(e) => setForm((f) => ({ ...f, unitRecipe: e.target.value }))}
              placeholder="g, ml, unidad"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Factor de conversión"
            hint={`1 ${form.unitPurchase || 'compra'} = ${
              form.conversionFactor && form.conversionFactor > 0
                ? form.conversionFactor.toLocaleString('es-CO')
                : '…'
            } ${form.unitRecipe || 'receta'}.`}
            required
          >
            <NumberInput
              value={form.conversionFactor}
              onChange={(v) => setForm((f) => ({ ...f, conversionFactor: v }))}
              decimals={4}
              min={0}
              disabled={pending}
              placeholder="1000"
            />
          </FormField>

          <FormField
            label="Mínimo de alerta"
            hint="En unidad de receta. Por debajo de este valor → aviso de existencias bajas."
          >
            <NumberInput
              value={form.thresholdMin}
              onChange={(v) => setForm((f) => ({ ...f, thresholdMin: v }))}
              decimals={4}
              min={0}
              disabled={pending}
              placeholder="0"
            />
          </FormField>

          <FormField
            label="Tamaño de porción (opcional)"
            hint={`En ${form.unitRecipe || 'unidad de receta'}. El inventario mostrará las porciones disponibles (stock ÷ porción). Vacío = sin porciones.`}
          >
            <NumberInput
              value={form.portionSize}
              onChange={(v) => setForm((f) => ({ ...f, portionSize: v }))}
              decimals={4}
              min={0}
              disabled={pending}
              placeholder="150"
            />
          </FormField>
        </div>

        <Checkbox
          label="Frena la venta si no hay stock"
          description="Destildá esto para un CONSUMIBLE (servilletas, sal): no frena la venta de los productos que lo usan y no aparece en Deudas de inventario. Se sigue descontando y costeando igual."
          disabled={pending}
          checked={form.blocksAvailability}
          onChange={(e) => setForm((f) => ({ ...f, blocksAvailability: e.target.checked }))}
        />

        {isEdit ? (
          <Checkbox
            label="Activo"
            disabled={pending}
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

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
              onClick={() => router.push('/ingredients')}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear insumo'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title="¿Desactivar insumo?"
        description={`Vas a desactivar "${initial?.name ?? ''}". No se borra del histórico.`}
        confirmLabel="Sí, desactivar"
        destructive
        pending={pending}
      />
    </>
  );
}
