'use client';

import type { Invoice } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, PinField, formatCop, isValidPin } from '@pos-tercos/ui';
import { FileImage } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { markInvoicePaid } from '../api/client';

export function InvoiceMarkPaidDialog({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (): Promise<void> => {
    if (!file) {
      setError('Seleccioná el comprobante (imagen).');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await markInvoicePaid(invoice.id, file, pin, {
        paidAt,
        note: note.trim() || undefined,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar pagada.');
    } finally {
      setPending(false);
    }
  };

  const valid = file !== null && isValidPin(pin);
  const supplierLabel = invoice.supplierName ?? 'Proveedor sin nombre';
  const total = invoice.total ?? 0;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Marcar factura como pagada"
      description={`${supplierLabel} · ${invoice.invoiceNumber ?? 'sin nº'} · total ${formatCop(total)}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending ? 'Subiendo…' : 'Confirmar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          label="Comprobante (foto de transferencia/recibo)"
          required
          hint="JPEG, PNG o WebP. Máx 10 MB."
        >
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFile}
            disabled={pending}
          />
        </FormField>
        {preview ? (
          <div className="flex justify-center rounded-lg border border-border bg-muted/40 p-2">
            <img src={preview} alt="Comprobante" className="max-h-56 w-auto rounded" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
            <FileImage className="h-4 w-4" /> Sin imagen seleccionada
          </div>
        )}
        <FormField label="Fecha del pago" hint="Por defecto hoy.">
          <Input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={pending}
          />
        </FormField>
        <FormField label="Nota (opcional)">
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. transferencia Bancolombia"
            maxLength={500}
            disabled={pending}
          />
        </FormField>
        <PinField value={pin} onChange={setPin} disabled={pending} />
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
