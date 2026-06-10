'use client';

import { Input, Label, MoneyInput, formatCop } from '@pos-tercos/ui';

interface InvoiceMetaSectionProps {
  invoiceNumber: string;
  onInvoiceNumberChange: (v: string) => void;
  total: string;
  onTotalChange: (v: string) => void;
  iva: string;
  onIvaChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  computedItemsTotal: number;
  disabled?: boolean;
}

export function InvoiceMetaSection({
  invoiceNumber,
  onInvoiceNumberChange,
  total,
  onTotalChange,
  iva,
  onIvaChange,
  notes,
  onNotesChange,
  computedItemsTotal,
  disabled,
}: InvoiceMetaSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <header><h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Datos de la factura</h3></header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="invoiceNumber">Número</Label>
          <Input id="invoiceNumber" disabled={disabled} value={invoiceNumber} onChange={(e) => onInvoiceNumberChange(e.target.value)} placeholder="F-12345" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="total">Total (COP)</Label>
          <MoneyInput id="total" required disabled={disabled} value={total} onChange={onTotalChange} />
          {Math.abs(Number(total) - computedItemsTotal) > 1 && total !== '' && (
            <p className="text-xs text-warning">Suma de ítems: {formatCop(computedItemsTotal)}.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iva">IVA (COP)</Label>
          <MoneyInput id="iva" disabled={disabled} value={iva} onChange={onIvaChange} placeholder="opcional" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea id="notes" rows={2} maxLength={500} disabled={disabled} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Comentarios opcionales sobre la factura." className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
    </section>
  );
}
