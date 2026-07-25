'use client';

import type { PaymentMethodSetting } from '@pos-tercos/types';
import { Button, ConfirmDialog, LoadingSkeleton } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { deletePaymentMethod, listAllPaymentMethods, updatePaymentMethod } from '../api/client';
import { PaymentMethodFormDialog } from './PaymentMethodFormDialog';
import { PaymentMethodRow } from './PaymentMethodRow';
import { getErrorMessage } from '../../../lib/errors';

type FormState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; initial: PaymentMethodSetting };

/** CRUD de los medios de pago que el POS ofrece al cobrar. */
export function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethodSetting[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodSetting | null>(null);

  useEffect(() => {
    listAllPaymentMethods()
      .then(setMethods)
      .catch((e) => setError(getErrorMessage(e, 'Error cargando')));
  }, []);

  const upsert = (m: PaymentMethodSetting) =>
    setMethods((prev) => {
      const rest = (prev ?? []).filter((x) => x.code !== m.code);
      return [...rest, m].sort((a, b) => a.sortOrder - b.sortOrder);
    });

  const toggle = async (m: PaymentMethodSetting) => {
    setPending(m.code);
    setError(null);
    try {
      upsert(await updatePaymentMethod(m.code, { enabled: !m.enabled }));
    } catch (e) {
      setError(getErrorMessage(e, 'Error guardando'));
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setPending(deleteTarget.code);
    setError(null);
    try {
      await deletePaymentMethod(deleteTarget.code);
      setMethods((prev) => (prev ?? []).filter((x) => x.code !== deleteTarget.code));
      setDeleteTarget(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo borrar'));
    } finally {
      setPending(null);
    }
  };

  if (error && !methods) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!methods) return <LoadingSkeleton shape="text" count={5} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {methods.filter((m) => m.enabled).length} activos · {methods.length} en total
        </p>
        <Button size="sm" onClick={() => setForm({ open: true, mode: 'create' })}>
          + Agregar medio de pago
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {methods.map((m) => (
            <PaymentMethodRow
              key={m.code}
              method={m}
              busy={pending !== null}
              onToggle={() => toggle(m)}
              onEdit={() => setForm({ open: true, mode: 'edit', initial: m })}
              onDelete={() => setDeleteTarget(m)}
            />
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Los métodos deshabilitados desaparecen del cobro en el POS (incluida la cuenta dividida) y
        el servidor rechaza cualquier cobro que los use. Sin conexión, el POS cobra con Efectivo y
        Transferencia.
      </p>

      {form.open ? (
        <PaymentMethodFormDialog
          open
          mode={form.mode}
          initial={form.mode === 'edit' ? form.initial : undefined}
          onClose={() => setForm({ open: false })}
          onSaved={upsert}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Borrar ${deleteTarget?.name ?? ''}`}
        description="Los pagos ya registrados con este método se conservan; solo deja de ofrecerse al cobrar."
        confirmLabel="Borrar"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
