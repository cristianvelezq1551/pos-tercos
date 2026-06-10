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
import type { Subproduct } from '@pos-tercos/types';
import { createSubproduct, deactivateSubproduct, updateSubproduct } from '../api/client';

interface SubproductFormProps {
  initial?: Subproduct;
}

interface FormState {
  name: string;
  yield: number | null;
  unit: string;
  thresholdMin: number | null;
  isActive: boolean;
}

export function SubproductForm({ initial }: SubproductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    yield: initial?.yield ?? null,
    unit: initial?.unit ?? 'unidad',
    thresholdMin: initial?.thresholdMin ?? null,
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (form.yield === null || form.yield <= 0) {
      setError('El rendimiento debe ser un número positivo.');
      return;
    }

    try {
      if (isEdit && initial) {
        await updateSubproduct(initial.id, {
          name: form.name,
          yield: form.yield,
          unit: form.unit,
          thresholdMin: form.thresholdMin ?? 0,
          isActive: form.isActive,
        });
      } else {
        await createSubproduct({
          name: form.name,
          yield: form.yield,
          unit: form.unit,
          thresholdMin: form.thresholdMin ?? 0,
        });
      }
      startTransition(() => {
        router.push('/subproducts');
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
      await deactivateSubproduct(initial.id);
      startTransition(() => {
        router.push('/subproducts');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
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
