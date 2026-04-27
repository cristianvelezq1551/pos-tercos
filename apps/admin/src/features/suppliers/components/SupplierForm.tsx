'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Supplier } from '@pos-tercos/types';
import { createSupplier, deactivateSupplier, updateSupplier } from '../api/client';

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
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    if (!window.confirm(`¿Desactivar el proveedor "${initial.name}"?`)) return;
    setError(null);
    try {
      await deactivateSupplier(initial.id);
      startTransition(() => {
        router.push('/suppliers');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre / razón social</Label>
          <Input
            id="name"
            required
            maxLength={120}
            disabled={pending}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Distribuidora La Mejor S.A.S."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nit">NIT</Label>
          <Input
            id="nit"
            required
            maxLength={40}
            disabled={pending}
            value={form.nit}
            onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))}
            placeholder="900123456-1"
          />
          <p className="text-xs text-gray-500">Identificador único. No se puede repetir.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            disabled={pending}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+57 300 000 0000"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            maxLength={120}
            disabled={pending}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="ventas@proveedor.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          maxLength={500}
          rows={3}
          disabled={pending}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Cualquier dato útil: días de visita, condiciones de pago, contacto preferido…"
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-gray-500">{form.notes.length} / 500</p>
      </div>

      {isEdit && (
        <div className="flex items-center gap-2">
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
  );
}
