'use client';

import { Button, ConfirmDialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteInvoiceDraft } from '../api/client';

/**
 * FASE 4 ajustes 2.10. Solo renderear cuando invoice.status === 'PENDING_REVIEW'.
 * Confirma con ConfirmDialog antes de borrar. On success → redirect a /invoices.
 */
export function DeleteDraftButton({
  invoiceId,
  supplierName,
}: {
  invoiceId: string;
  supplierName: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setConfirmOpen(false);
    setPending(true);
    setError(null);
    try {
      await deleteInvoiceDraft(invoiceId);
      router.push('/invoices');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  const label = supplierName ?? 'sin proveedor';

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
      >
        {pending ? 'Eliminando…' : 'Eliminar borrador'}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="¿Eliminar borrador?"
        description={`Vas a eliminar el borrador de factura "${label}". No se puede deshacer; la foto (si existe) también se borra.`}
        confirmLabel="Sí, eliminar"
        destructive
        pending={pending}
      />
    </span>
  );
}
