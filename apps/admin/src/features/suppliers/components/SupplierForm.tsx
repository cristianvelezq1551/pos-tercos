'use client';

import {
  Button,
  Checkbox,
  ConfirmDialog,
  FormField,
  Input,
  Textarea,
} from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Supplier } from '@pos-tercos/types';
import { createSupplier, deactivateSupplier, updateSupplier } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface SupplierFormProps {
  initial?: Supplier;
}

interface FormState {
  nit: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  isActive: boolean;
}

export function SupplierForm({ initial }: SupplierFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    nit: initial?.nit ?? '',
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    notes: initial?.notes ?? '',
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedNit = form.nit.trim();
    const trimmedName = form.name.trim();
    if (!trimmedNit || !trimmedName) {
      setError('NIT y nombre son obligatorios.');
      return;
    }

    const phone = form.phone.trim();
    const email = form.email.trim();
    const notes = form.notes.trim();

    try {
      if (isEdit && initial) {
        await updateSupplier(initial.id, {
          nit: trimmedNit,
          name: trimmedName,
          phone: phone || undefined,
          email: email || undefined,
          notes: notes || undefined,
          isActive: form.isActive,
        });
      } else {
        await createSupplier({
          nit: trimmedNit,
          name: trimmedName,
          phone: phone || undefined,
          email: email || undefined,
          notes: notes || undefined,
        });
      }
      startTransition(() => {
        router.push('/suppliers');
        router.refresh();
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Error desconocido'));
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    setError(null);
    try {
      await deactivateSupplier(initial.id);
      startTransition(() => {
        router.push('/suppliers');
        router.refresh();
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Error desconocido'));
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nombre / razón social" required>
            <Input
              required
              maxLength={120}
              disabled={pending}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Distribuidora La Mejor S.A.S."
            />
          </FormField>

          <FormField label="NIT" hint="Identificador único. No se puede repetir." required>
            <Input
              required
              maxLength={40}
              disabled={pending}
              value={form.nit}
              onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))}
              placeholder="900123456-1"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Teléfono">
            <Input
              type="tel"
              inputMode="tel"
              maxLength={40}
              disabled={pending}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+57 300 000 0000"
            />
          </FormField>

          <FormField label="Email">
            <Input
              type="email"
              inputMode="email"
              maxLength={120}
              disabled={pending}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="ventas@proveedor.com"
            />
          </FormField>
        </div>

        <FormField label="Notas" hint={`${form.notes.length} / 500`}>
          <Textarea
            maxLength={500}
            rows={3}
            disabled={pending}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Cualquier dato útil: días de visita, condiciones de pago, contacto preferido…"
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
              disabled={pending || !initial?.isActive}
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
              onClick={() => router.push('/suppliers')}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title="¿Desactivar proveedor?"
        description={`Vas a desactivar "${initial?.name ?? ''}". Las facturas históricas siguen visibles.`}
        confirmLabel="Sí, desactivar"
        destructive
        pending={pending}
      />
    </>
  );
}
