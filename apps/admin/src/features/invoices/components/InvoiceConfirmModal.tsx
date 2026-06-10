'use client';

import { Button, ConfirmDialog, Dialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { InvoiceDraftResponse, Stockable, Supplier } from '@pos-tercos/types';
import {
  confirmFromPhoto,
  confirmInvoice,
  confirmManualInvoice,
  discardPhoto,
  rejectInvoice,
} from '../api/client';
import { SupplierSection } from './SupplierSection';
import { InvoiceMetaSection } from './InvoiceMetaSection';
import { ItemsSection } from './ItemsSection';
import { validateInvoice } from './validate-invoice';
import { useInvoiceRows } from '../hooks/useInvoiceRows';

interface InvoiceConfirmModalProps {
  draft: InvoiceDraftResponse;
  /** Carga manual sin draft persistido: confirm crea+confirma; reject solo cierra. */
  manualMode?: boolean;
  /** Si vino del flujo IA: foto en storage + modelo. Confirm la asocia y la persiste. */
  iaContext?: { photoStorageKey: string; aiModelUsed: string };
  suppliers: Supplier[];
  stockables: Stockable[];
  onClose: () => void;
  onConfirmed: () => void;
  onStockableCreated: (item: Stockable) => void;
}

type SupplierMode = 'existing' | 'new';

export function InvoiceConfirmModal({
  draft,
  manualMode = false,
  iaContext,
  suppliers,
  stockables,
  onClose,
  onConfirmed,
  onStockableCreated,
}: InvoiceConfirmModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchedSupplier = useMemo(() => {
    const target = draft.extraction.supplierNit?.replace(/\s+/g, '');
    if (!target) return null;
    return suppliers.find((s) => s.nit.replace(/\s+/g, '') === target) ?? null;
  }, [draft.extraction.supplierNit, suppliers]);

  const [supplierMode, setSupplierMode] = useState<SupplierMode>(
    matchedSupplier ? 'existing' : 'new',
  );
  const [supplierId, setSupplierId] = useState<string>(matchedSupplier?.id ?? '');
  const [newSupplierNit, setNewSupplierNit] = useState(draft.extraction.supplierNit ?? '');
  const [newSupplierName, setNewSupplierName] = useState(draft.extraction.supplierName ?? '');

  const [invoiceNumber, setInvoiceNumber] = useState(draft.extraction.invoiceNumber ?? '');
  const [total, setTotal] = useState<string>(
    draft.extraction.total !== null ? String(draft.extraction.total) : '',
  );
  const [iva, setIva] = useState<string>(
    draft.extraction.iva !== null ? String(draft.extraction.iva) : '',
  );
  const [notes, setNotes] = useState('');

  const { rows, updateRow, removeRow, addRow, computedItemsTotal } = useInvoiceRows(draft, stockables);

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    const v = validateInvoice({ supplierMode, supplierId, newSupplierNit, newSupplierName, suppliers, rows, total, iva, invoiceNumber, notes });
    if (!v.valid) { setError(v.reason); return; }
    setSubmitting(true);
    try {
      if (iaContext) {
        // IA: crea+confirma en un solo paso, asociando la foto previa.
        await confirmFromPhoto(v.payload, iaContext.photoStorageKey, iaContext.aiModelUsed);
      } else if (manualMode) {
        // Manual: crea+confirma sin foto. Sin borrador previo.
        await confirmManualInvoice(v.payload);
      } else {
        // Caso legacy: draft persistido (clone) → solo confirma.
        await confirmInvoice(draft.invoice.id, v.payload);
      }
      onConfirmed();
      startTransition(() => { router.push('/invoices'); router.refresh(); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (): Promise<void> => {
    setConfirmReject(false);
    setError(null);
    // En modo IA limpiamos la foto subida; manual no tiene nada que limpiar.
    if (iaContext || manualMode) {
      if (iaContext) await discardPhoto(iaContext.photoStorageKey);
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await rejectInvoice(draft.invoice.id);
      onClose();
      startTransition(() => { router.refresh(); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al rechazar');
    } finally {
      setSubmitting(false);
    }
  };

  const warnings = draft.extraction.warnings;
  const aiModel = draft.invoice.aiModelUsed;

  return (
    <>
    <Dialog
      open
      onClose={submitting ? () => {} : onClose}
      title="Revisar y confirmar factura"
      description={aiModel ? `Extracción IA · ${aiModel}` : 'Extracción IA'}
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmReject(true)} disabled={submitting}>Rechazar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting || pending}>
            {submitting ? 'Confirmando…' : 'Confirmar y sumar al inventario'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {warnings.length > 0 && (
          <div className="rounded-md border border-warning-border bg-warning-bg/30 p-3 text-sm text-warning">
            <p className="font-semibold">⚠️ La IA marcó estas observaciones:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w, i) => (<li key={i}>{w}</li>))}
            </ul>
          </div>
        )}

        <SupplierSection
          supplierMode={supplierMode}
          onSupplierModeChange={setSupplierMode}
          supplierId={supplierId}
          onSupplierIdChange={setSupplierId}
          newSupplierNit={newSupplierNit}
          onNewSupplierNitChange={setNewSupplierNit}
          newSupplierName={newSupplierName}
          onNewSupplierNameChange={setNewSupplierName}
          matchedSupplier={matchedSupplier}
          suppliers={suppliers}
          disabled={submitting}
        />

        <InvoiceMetaSection
          invoiceNumber={invoiceNumber}
          onInvoiceNumberChange={setInvoiceNumber}
          total={total}
          onTotalChange={setTotal}
          iva={iva}
          onIvaChange={setIva}
          notes={notes}
          onNotesChange={setNotes}
          computedItemsTotal={computedItemsTotal}
          disabled={submitting}
        />

        <ItemsSection
          rows={rows}
          stockables={stockables}
          disabled={submitting}
          onAdd={addRow}
          onUpdate={updateRow}
          onRemove={removeRow}
          onStockableCreated={onStockableCreated}
        />

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
      </div>
    </Dialog>

      <ConfirmDialog
        open={confirmReject}
        onCancel={() => setConfirmReject(false)}
        onConfirm={handleReject}
        title="¿Rechazar esta factura?"
        description="El borrador queda marcado como rechazado. No se toca el inventario."
        confirmLabel="Sí, rechazar"
        destructive
        pending={submitting}
      />
    </>
  );
}
