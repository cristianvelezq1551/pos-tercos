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
import { UNIT_LABEL_ERROR, isValidUnitLabel, type Subproduct } from '@pos-tercos/types';
import { createSubproduct, deactivateSubproduct, updateSubproduct } from '../api/client';
import { PreparationStepsField } from '../../../components/PreparationStepsField';
import { ImageUploadField } from '../../../components/ImageUploadField';
import { getErrorMessage } from '../../../lib/errors';

interface SubproductFormProps {
  initial?: Subproduct;
}

interface FormState {
  name: string;
  yield: number | null;
  unit: string;
  thresholdMin: number | null;
  portionSize: number | null;
  preparationSteps: string[];
  blocksAvailability: boolean;
  showInKitchen: boolean;
  prepImageUrl: string;
  isActive: boolean;
}

export function SubproductForm({ initial }: SubproductFormProps) {
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
    yield: initial?.yield ?? null,
    unit: initial?.unit ?? 'unidad',
    thresholdMin: initial?.thresholdMin ?? null,
    portionSize: initial?.portionSize ?? null,
    preparationSteps: initial?.preparationSteps ?? [],
    blocksAvailability: initial?.blocksAvailability ?? true,
    showInKitchen: initial?.showInKitchen ?? true,
    prepImageUrl: initial?.prepImageUrl ?? '',
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    if (form.yield === null || form.yield <= 0) {
      setError('El rendimiento debe ser un número positivo.');
      return;
    }
    if (form.portionSize !== null && form.portionSize <= 0) {
      setError('El tamaño de porción debe ser mayor a 0 (o dejarse vacío).');
      return;
    }
    if (!isValidUnitLabel(form.unit)) {
      setError(UNIT_LABEL_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && initial) {
        await updateSubproduct(initial.id, {
          name: form.name,
          yield: form.yield,
          unit: form.unit,
          thresholdMin: form.thresholdMin ?? 0,
          portionSize: form.portionSize,
          preparationSteps: form.preparationSteps,
          blocksAvailability: form.blocksAvailability,
          showInKitchen: form.showInKitchen,
          prepImageUrl: form.prepImageUrl || null,
          isActive: form.isActive,
        });
      } else {
        await createSubproduct({
          name: form.name,
          yield: form.yield,
          unit: form.unit,
          thresholdMin: form.thresholdMin ?? 0,
          portionSize: form.portionSize,
          preparationSteps: form.preparationSteps,
          blocksAvailability: form.blocksAvailability,
          showInKitchen: form.showInKitchen,
          prepImageUrl: form.prepImageUrl || null,
        });
      }
      startTransition(() => {
        router.push('/subproducts');
        router.refresh();
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Error desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!initial || pending) return;
    setError(null);
    setSubmitting(true);
    try {
      await deactivateSubproduct(initial.id);
      startTransition(() => {
        router.push('/subproducts');
        router.refresh();
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Error desconocido'));
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
            placeholder="Pollo Nashville cocido, masa pizza fermentada…"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Rendimiento (porciones por preparación)"
            hint="Cuántas porciones rinde una preparación de la receta. Ej: una olla de salsa rinde 7 porciones → 7."
            required
          >
            <NumberInput
              value={form.yield}
              onChange={(v) => setForm((f) => ({ ...f, yield: v }))}
              decimals={4}
              min={0}
              disabled={pending}
              placeholder="7"
            />
          </FormField>

          <FormField label="Unidad" hint="Cómo se cuenta cada unidad del subproducto." required>
            <Input
              required
              maxLength={20}
              disabled={pending}
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="unidad"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Umbral mínimo de stock"
            hint={`Si el stock cae bajo este nivel (en ${form.unit || 'unidad'}), aparece como "Falta producir" en el inventario. 0 = sin umbral.`}
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
            hint={`En ${form.unit || 'unidad'}. El inventario mostrará las porciones disponibles (stock ÷ porción). Vacío = sin porciones.`}
          >
            <NumberInput
              value={form.portionSize}
              onChange={(v) => setForm((f) => ({ ...f, portionSize: v }))}
              decimals={4}
              min={0}
              disabled={pending}
              placeholder="1"
            />
          </FormField>
        </div>

        <PreparationStepsField
          value={form.preparationSteps}
          onChange={(steps) => setForm((f) => ({ ...f, preparationSteps: steps }))}
        />

        <ImageUploadField
          label="Foto de la preparación (cocina)"
          hint="La ve el cocinero en la Biblia: cómo queda la tanda o un paso clave."
          imageUrl={form.prepImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, prepImageUrl: url }))}
          disabled={pending}
        />

        <Checkbox
          label="Frena la venta si no hay stock"
          description="Desmarca esto si es opcional (ej. una salsa de acompañamiento): no frena la venta de los productos que lo usan y no aparece en Deudas de inventario. Se sigue descontando y costeando igual."
          disabled={pending}
          checked={form.blocksAvailability}
          onChange={(e) => setForm((f) => ({ ...f, blocksAvailability: e.target.checked }))}
        />

        <Checkbox
          label="Se ve en la cocina"
          description="Desmárcalo para lo que está en el catálogo SOLO para costear (empaques, recipientes, bolsas): desaparece de la Biblia y del inventario de la app de cocina. Se sigue descontando y costeando igual."
          disabled={pending}
          checked={form.showInKitchen}
          onChange={(e) => setForm((f) => ({ ...f, showInKitchen: e.target.checked }))}
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
              onClick={() => router.push('/subproducts')}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear subproducto'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title="¿Desactivar subproducto?"
        description={`Vas a desactivar "${initial?.name ?? ''}". No se borra del histórico.`}
        confirmLabel="Sí, desactivar"
        destructive
        pending={pending}
      />
    </>
  );
}
