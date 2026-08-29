'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ConfirmInvoice } from '@pos-tercos/types';
import { saveInvoiceDraft } from '../api/client';
import { buildDraftPayload } from '../components/build-draft-payload';
import type { DraftRow } from '../components/InvoiceItemRow';
import { getErrorMessage } from '../../../lib/errors';

interface UseSaveDraftOptions {
  rows: DraftRow[];
  warnings: string[];
  /** Presente si la factura vino del flujo con foto. */
  iaContext?: { photoStorageKey: string; aiModelUsed: string };
  /** Id del borrador que se está reemplazando; ausente = se crea uno nuevo. */
  draftId?: string;
  onSaved: () => void;
}

/**
 * Guardar la factura como borrador: queda editable y borrable, y no toca
 * inventario, costos ni tesorería. El pago no se declara acá — se pide al
 * confirmar, porque registrar plata contra una factura que todavía puede
 * borrarse dejaría un pago sin factura.
 *
 * Vive en un hook y no dentro del modal para no seguir engordando un archivo
 * que ya está por encima del límite de líneas del repo.
 */
export function useSaveDraft(options: UseSaveDraftOptions) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (payload: ConfirmInvoice): Promise<void> => {
    setError(null);
    setSaving(true);
    try {
      await saveInvoiceDraft(
        buildDraftPayload(payload, options.rows, {
          iaContext: options.iaContext,
          warnings: options.warnings,
        }),
        options.draftId,
      );
      options.onSaved();
      router.push('/invoices?status=PENDING_REVIEW');
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el borrador'));
    } finally {
      setSaving(false);
    }
  };

  return { save, saving, error };
}
