'use client';

import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cloneInvoice } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface CloneInvoiceButtonProps {
  sourceInvoiceId: string;
}

/**
 * POST /invoices/from-clone → redirige a la edición del nuevo draft.
 * Usar para repetir cargas recurrentes o cuando la IA falla.
 */
export function CloneInvoiceButton({ sourceInvoiceId }: CloneInvoiceButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const draft = await cloneInvoice(sourceInvoiceId);
      startTransition(() => {
        router.push(`/invoices/${draft.invoice.id}/edit`);
      });
    } catch (e) {
      setError(getErrorMessage(e, 'Error al clonar'));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClone} disabled={busy || pending}>
        {busy || pending ? 'Clonando…' : 'Clonar para nueva entrada'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
