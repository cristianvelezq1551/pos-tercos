'use client';

import { Button, ConfirmDialog, Dialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { InvoiceDraftResponse, Stockable, Supplier } from '@pos-tercos/types';
import {
  confirmFromPhoto,
  confirmInvoice,
  confirmManualInvoice,
  discardPaymentProof,
  discardPhoto,
  rejectInvoice,
} from '../api/client';
import { ManualEntryGuide } from './ManualEntryGuide';
import { SupplierSection } from './SupplierSection';
import { InvoiceMetaSection } from './InvoiceMetaSection';
import { ItemsSection } from './ItemsSection';
import {
  PaymentAtConfirmSection,
  initialConfirmPaymentState,
  type ConfirmPaymentState,
} from './PaymentAtConfirmSection';
import { buildPaymentBlock } from './build-payment-block';
import { validateInvoice } from './validate-invoice';
import { useInvoiceRows } from '../hooks/useInvoiceRows';
import { useSaveDraft } from '../hooks/useSaveDraft';
import { getErrorMessage } from '../../../lib/errors';

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
  // La IA lo saca de la línea "domicilio/envío/flete" (que ya NO llega como
  // ítem). Si no lo trae, queda vacío y se escribe a mano.
  const [freight, setFreight] = useState<string>(
    draft.extraction.freight !== null && draft.extraction.freight !== undefined
      ? String(draft.extraction.freight)
      : '',
  );
  const [notes, setNotes] = useState('');

  // "Nace pagada" — default sí (el 95% de las facturas ya están pagadas).
  const hasInvoicePhoto = Boolean(iaContext) || draft.invoice.photoStorageKey !== null;
  const [payment, setPayment] = useState<ConfirmPaymentState>(() =>
    initialConfirmPaymentState(hasInvoicePhoto),
  );

  const { rows, updateRow, removeRow, addRow, computedItemsTotal } = useInvoiceRows(draft, stockables);

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    const v = validateInvoice({ supplierMode, supplierId, newSupplierNit, newSupplierName, suppliers, rows, total, iva, freight, invoiceNumber, notes });
    if (!v.valid) { setError(v.reason); return; }
    setSubmitting(true);
    let uploadedProofKey: string | undefined;
    try {
      const paymentBlock = await buildPaymentBlock(payment, hasInvoicePhoto);
      uploadedProofKey = paymentBlock?.proofStorageKey;
      const payload = paymentBlock ? { ...v.payload, payment: paymentBlock } : v.payload;
      if (iaContext) {
        // IA: crea+confirma en un solo paso, asociando la foto previa.
        await confirmFromPhoto(payload, iaContext.photoStorageKey, iaContext.aiModelUsed);
      } else if (manualMode) {
        // Manual: crea+confirma sin foto. Sin borrador previo.
        await confirmManualInvoice(payload);
      } else {
        // Caso legacy: draft persistido (clone) → solo confirma.
        await confirmInvoice(draft.invoice.id, payload);
      }
      onConfirmed();
      startTransition(() => { router.push('/invoices'); router.refresh(); });
    } catch (e) {
      // El comprobante pre-subido quedó huérfano — limpiarlo (best-effort).
      if (uploadedProofKey) void discardPaymentProof(uploadedProofKey);
      setError(getErrorMessage(e, 'Error al confirmar'));
    } finally {
      setSubmitting(false);
    }
  };

  // Guardar sin confirmar: mismo contenido validado, pero la factura queda como
  // borrador y no toca inventario, costos ni tesorería.
  const draftSaver = useSaveDraft({
    rows,
    warnings: draft.extraction.warnings,
    iaContext,
    draftId: iaContext || manualMode ? undefined : draft.invoice.id,
    onSaved: onConfirmed,
  });
  const handleSaveDraft = (): void => {
    setError(null);
    const v = validateInvoice({ supplierMode, supplierId, newSupplierNit, newSupplierName, suppliers, rows, total, iva, freight, invoiceNumber, notes });
    if (!v.valid) { setError(v.reason); return; }
    void draftSaver.save(v.payload);
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
      setError(getErrorMessage(e, 'Error al rechazar'));
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
      description={
        manualMode
          ? 'Carga manual · sin IA'
          : aiModel
            ? `Extracción IA · ${aiModel}`
            : 'Extracción IA'
      }
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmReject(true)} disabled={submitting}>Rechazar</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={submitting || draftSaver.saving || pending}
          >
            {draftSaver.saving ? 'Guardando…' : 'Guardar para revisar'}
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting || pending}>
            {submitting ? 'Confirmando…' : 'Confirmar y sumar al inventario'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {manualMode && <ManualEntryGuide />}
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
          freight={freight}
          onFreightChange={setFreight}
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

        <PaymentAtConfirmSection
          state={payment}
          onChange={setPayment}
          hasInvoicePhoto={hasInvoicePhoto}
          total={Number(total) || 0}
          disabled={submitting}
        />

        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Guardar para revisar</span> deja la factura
          como borrador: no suma al inventario, no toca los costos ni la plata, y la puedes editar o
          borrar cuando quieras. Los datos de pago se piden al confirmar.
        </p>

        {(error ?? draftSaver.error) && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error ?? draftSaver.error}</p>
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
