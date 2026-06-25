import type { ConfirmInvoice, ConfirmInvoiceItem, Supplier } from '@pos-tercos/types';
import type { DraftRow } from './InvoiceItemRow';

type SupplierMode = 'existing' | 'new';

export type Validation =
  | { valid: true; payload: ConfirmInvoice }
  | { valid: false; reason: string };

export interface ValidateInvoiceInput {
  supplierMode: SupplierMode;
  supplierId: string;
  newSupplierNit: string;
  newSupplierName: string;
  suppliers: Supplier[];
  rows: DraftRow[];
  total: string;
  iva: string;
  invoiceNumber: string;
  notes: string;
}

export function validateInvoice(input: ValidateInvoiceInput): Validation {
  const {
    supplierMode,
    supplierId,
    newSupplierNit,
    newSupplierName,
    suppliers,
    rows,
    total,
    iva,
    invoiceNumber,
    notes,
  } = input;

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
        reason: `Asocia todos los ítems con un Insumo o Producto. Falta: "${r.descriptionRaw || '(sin descripción)'}"`,
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
    const baseFactor = r.baseFactor != null && r.baseFactor > 0 ? r.baseFactor : undefined;
    return sel.entityType === 'INGREDIENT'
      ? {
          entityType: 'INGREDIENT',
          ingredientId: sel.id,
          descriptionRaw: r.descriptionRaw.trim(),
          quantity: r.quantity,
          unit: r.unit.trim(),
          unitPrice: r.unitPrice,
          total: r.total,
          baseFactor,
        }
      : {
          entityType: 'PRODUCT',
          productId: sel.id,
          descriptionRaw: r.descriptionRaw.trim(),
          quantity: r.quantity,
          unit: r.unit.trim(),
          unitPrice: r.unitPrice,
          total: r.total,
          baseFactor,
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
}
