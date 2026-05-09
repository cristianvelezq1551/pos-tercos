'use client';

import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteInvoiceDraft } from '../api/client';

/**
 * FASE 4 ajustes 2.10. Solo renderear cuando invoice.status === 'PENDING_REVIEW'.
 * Confirma con window.confirm antes de borrar. On success → redirect a /invoices.
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
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (pending) return;
    const label = supplierName ?? 'sin proveedor';
    if (
      !window.confirm(
        `¿Eliminar borrador de factura "${label}"? Esta acción no se puede deshacer. La foto (si existe) también se borra.`,
      )
    ) {
      return;
    }
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

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="destructive"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? 'Eliminando…' : 'Eliminar borrador'}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
