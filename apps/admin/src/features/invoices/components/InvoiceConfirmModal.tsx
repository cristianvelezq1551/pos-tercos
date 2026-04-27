'use client';

import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { bestMatch } from '@pos-tercos/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type {
  ConfirmInvoice,
  ConfirmInvoiceItem,
  InvoiceDraftResponse,
  Stockable,
  Supplier,
} from '@pos-tercos/types';
import { confirmInvoice, rejectInvoice } from '../api/client';
import { InvoiceItemRow, type DraftRow } from './InvoiceItemRow';

interface InvoiceConfirmModalProps {
  draft: InvoiceDraftResponse;
  suppliers: Supplier[];
  stockables: Stockable[];
  onClose: () => void;
  onConfirmed: () => void;
  onStockableCreated: (item: Stockable) => void;
}

type SupplierMode = 'existing' | 'new';

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function InvoiceConfirmModal({
  draft,
  suppliers,
  stockables,
  onClose,
  onConfirmed,
  onStockableCreated,
}: InvoiceConfirmModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
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

  const [rows, setRows] = useState<DraftRow[]>(() =>
    draft.extraction.items.map((item) => {
      const match = bestMatch(
        item.descriptionRaw,
        stockables,
        (s) => s.name,
        0.4,
      );
      return {
        localId: nextRowId(),
        selection: null,
        descriptionRaw: item.descriptionRaw,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.total,
        suggestion: match
          ? {
              entityType: match.candidate.type,
              id: match.candidate.id,
              name: match.candidate.name,
              score: match.score,
            }
          : null,
      };
    }),
  );

  // Recompute suggestions when stockables change (e.g. user creates a new one
  // and we want to update sugerencias para otras filas).
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.selection) return r;
        const match = bestMatch(r.descriptionRaw, stockables, (s) => s.name, 0.4);
        return {
          ...r,
          suggestion: match
            ? {
                entityType: match.candidate.type,
                id: match.candidate.id,
                name: match.candidate.name,
                score: match.score,
              }
            : null,
        };
      }),
    );
  }, [stockables]);

  const updateRow = (localId: string, patch: Partial<DraftRow>): void => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const merged = { ...r, ...patch };
        if (
          (patch.quantity !== undefined || patch.unitPrice !== undefined) &&
          patch.total === undefined
        ) {
          merged.total = roundMoney(merged.quantity * merged.unitPrice);
        }
        return merged;
      }),
    );
  };

  const removeRow = (localId: string): void => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  const addRow = (): void => {
    setRows((prev) => [
      ...prev,
      {
        localId: nextRowId(),
        selection: null,
        descriptionRaw: '',
        quantity: 1,
        unit: 'kg',
        unitPrice: 0,
        total: 0,
        suggestion: null,
      },
    ]);
  };

  const computedItemsTotal = useMemo(
    () => rows.reduce((acc, r) => acc + r.total, 0),
    [rows],
  );

  type Validation = { valid: true; payload: ConfirmInvoice } | { valid: false; reason: string };

  const validate = (): Validation => {
    let nit = '';
    let name = '';
    if (supplierMode === 'existing') {
      if (!supplierId) return { valid: false, reason: 'Seleccioná un proveedor.' };
      const found = suppliers.find((s) => s.id === supplierId);
      if (!found) return { valid: false, reason: 'Proveedor seleccionado no existe.' };
      nit = found.nit;
      name = found.name;
    } else {
      if (!newSupplierNit.trim()) return { valid: false, reason: 'NIT del proveedor requerido.' };
      if (!newSupplierName.trim()) return { valid: false, reason: 'Nombre del proveedor requerido.' };
      nit = newSupplierNit.trim();
      name = newSupplierName.trim();
    }

    if (rows.length === 0) {
      return { valid: false, reason: 'La factura debe tener al menos un ítem.' };
    }

    for (const r of rows) {
      if (!r.selection) {
        return {
          valid: false,
          reason: `Asociá todos los ítems con un Insumo o Producto. Falta: "${r.descriptionRaw || '(sin descripción)'}"`,
        };
      }
      if (!r.descriptionRaw.trim()) return { valid: false, reason: 'Cada ítem necesita descripción.' };
      if (!Number.isFinite(r.quantity) || r.quantity <= 0)
        return { valid: false, reason: `Cantidad inválida en "${r.descriptionRaw}".` };
      if (!Number.isFinite(r.unitPrice) || r.unitPrice < 0)
        return { valid: false, reason: `Precio unitario inválido en "${r.descriptionRaw}".` };
      if (!Number.isFinite(r.total) || r.total < 0)
        return { valid: false, reason: `Total inválido en "${r.descriptionRaw}".` };
      if (!r.unit.trim()) return { valid: false, reason: `Unidad requerida en "${r.descriptionRaw}".` };
    }

    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      return { valid: false, reason: 'Total de la factura inválido.' };
    }

    const ivaNum = iva.trim() === '' ? undefined : Number(iva);
    if (ivaNum !== undefined && (!Number.isFinite(ivaNum) || ivaNum < 0)) {
      return { valid: false, reason: 'IVA inválido.' };
    }

    const items: ConfirmInvoiceItem[] = rows.map((r) => {
      const sel = r.selection!;
      return sel.entityType === 'INGREDIENT'
        ? {
            entityType: 'INGREDIENT',
            ingredientId: sel.id,
            descriptionRaw: r.descriptionRaw.trim(),
            quantity: r.quantity,
            unit: r.unit.trim(),
            unitPrice: r.unitPrice,
            total: r.total,
          }
        : {
            entityType: 'PRODUCT',
            productId: sel.id,
            descriptionRaw: r.descriptionRaw.trim(),
            quantity: r.quantity,
            unit: r.unit.trim(),
            unitPrice: r.unitPrice,
            total: r.total,
          };
    });

    const payload: ConfirmInvoice = {
      supplierNit: nit,
      supplierName: name,
      invoiceNumber: invoiceNumber.trim() || undefined,
      total: totalNum,
      iva: ivaNum,
      items,
      notes: notes.trim() || undefined,
    };
    return { valid: true, payload };
  };

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    const v = validate();
    if (!v.valid) {
      setError(v.reason);
      return;
    }
    setSubmitting(true);
    try {
      await confirmInvoice(draft.invoice.id, v.payload);
      onConfirmed();
      startTransition(() => {
        router.push('/invoices');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (): Promise<void> => {
    if (!window.confirm('¿Rechazar esta factura? El draft queda marcado como REJECTED.')) return;
    setError(null);
    setSubmitting(true);
    try {
      await rejectInvoice(draft.invoice.id);
      onClose();
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al rechazar');
    } finally {
      setSubmitting(false);
    }
  };

  const warnings = draft.extraction.warnings;
  const aiModel = draft.invoice.aiModelUsed;

  return (
    <Dialog
      open
      onClose={submitting ? () => {} : onClose}
      title="Revisar y confirmar factura"
      description={aiModel ? `Extracción IA · ${aiModel}` : 'Extracción IA'}
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={handleReject} disabled={submitting}>Rechazar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting || pending}>
            {submitting ? 'Confirmando…' : 'Confirmar y descargar de stock'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">⚠️ La IA marcó estas observaciones:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w, i) => (<li key={i}>{w}</li>))}
            </ul>
          </div>
        )}

        <section className="space-y-3 rounded-lg border border-gray-200 p-4">
          <header><h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Proveedor</h3></header>

          <div className="flex gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="supplierMode" checked={supplierMode === 'existing'} onChange={() => setSupplierMode('existing')} disabled={submitting} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
              Existente
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="supplierMode" checked={supplierMode === 'new'} onChange={() => setSupplierMode('new')} disabled={submitting} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
              Nuevo
            </label>
            {matchedSupplier && supplierMode === 'existing' && (
              <span className="text-xs text-green-700">✓ Matcheado por NIT con &ldquo;{matchedSupplier.name}&rdquo;</span>
            )}
          </div>

          {supplierMode === 'existing' ? (
            <div className="space-y-1.5">
              <Label htmlFor="supplierId">Seleccionar proveedor</Label>
              <select id="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={submitting} className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <option value="">— Seleccionar —</option>
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.nit})</option>))}
              </select>
              {suppliers.length === 0 && (<p className="text-xs text-amber-700">No hay proveedores cargados. Cambiá a &quot;Nuevo&quot; para crear uno.</p>)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newSupplierNit">NIT</Label>
                <Input id="newSupplierNit" required disabled={submitting} value={newSupplierNit} onChange={(e) => setNewSupplierNit(e.target.value)} placeholder="900.123.456-7" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newSupplierName">Nombre</Label>
                <Input id="newSupplierName" required disabled={submitting} value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Distribuidora XX SA" />
              </div>
              <p className="col-span-full text-xs text-gray-500">Si el NIT ya existe, el sistema lo reutiliza automáticamente.</p>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-gray-200 p-4">
          <header><h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Datos de la factura</h3></header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">Número</Label>
              <Input id="invoiceNumber" disabled={submitting} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="F-12345" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total">Total (COP)</Label>
              <Input id="total" type="number" inputMode="decimal" step="any" min="0" required disabled={submitting} value={total} onChange={(e) => setTotal(e.target.value)} />
              {Math.abs(Number(total) - computedItemsTotal) > 1 && total !== '' && (
                <p className="text-xs text-amber-700">Suma de ítems: {computedItemsTotal.toLocaleString('es-CO')}.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iva">IVA (COP)</Label>
              <Input id="iva" type="number" inputMode="decimal" step="any" min="0" disabled={submitting} value={iva} onChange={(e) => setIva(e.target.value)} placeholder="opcional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <textarea id="notes" rows={2} maxLength={500} disabled={submitting} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Comentarios opcionales sobre la factura." className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          </div>
        </section>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Ítems ({rows.length})</h3>
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={submitting}>+ Agregar fila</Button>
          </header>

          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
                La IA no extrajo ítems o los borraste todos. Agregá al menos uno.
              </p>
            )}
            {rows.map((row, idx) => (
              <InvoiceItemRow
                key={row.localId}
                index={idx + 1}
                row={row}
                stockables={stockables}
                disabled={submitting}
                onChange={(patch) => updateRow(row.localId, patch)}
                onRemove={() => removeRow(row.localId)}
                onStockableCreated={onStockableCreated}
              />
            ))}
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </Dialog>
  );
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
