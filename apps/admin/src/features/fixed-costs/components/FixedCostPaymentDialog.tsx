'use client';

import { Button, Dialog, FormField, Input, MoneyInput, formatCop } from '@pos-tercos/ui';
import { FileImage } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { PocketPaymentField } from '../../../components/PocketPaymentField';
import { ymdLocalToday } from '../../../lib/dates';
import { markFixedCostPaid } from '../api/client';

/** Diálogo de "marcar pagado" un costo fijo. El período (year, month) viene
 *  preseteado desde el cockpit; el dueño solo sube el comprobante. */
export function FixedCostPaymentDialog({
  fixedCostId,
  fixedCostName,
  expectedAmount,
  periodYear,
  periodMonth,
  periodLabel,
  onClose,
  onSuccess,
}: {
  fixedCostId: string;
  fixedCostName: string;
  expectedAmount: number;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // ymdLocalToday, NO toISOString: de noche en Bogotá daría mañana.
  const [paidAt, setPaidAt] = useState(ymdLocalToday());
  const [amount, setAmount] = useState<string>(String(expectedAmount));
  const [note, setNote] = useState('');
  const [split, setSplit] = useState({ cashAmount: 0, bankAmount: expectedAmount });
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
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError('Monto inválido.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await markFixedCostPaid(fixedCostId, file, {
        periodYear,
        periodMonth,
        paidAt,
        amount: amountNum,
        note: note.trim() || undefined,
        cashAmount: split.cashAmount,
        bankAmount: split.bankAmount,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar pagado.');
    } finally {
      setPending(false);
    }
  };

  const valid = file !== null && Number.isFinite(Number(amount));

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Marcar pagado: ${fixedCostName}`}
      description={`${periodLabel} · esperado ${formatCop(expectedAmount)}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending ? 'Subiendo…' : 'Confirmar pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Comprobante" required hint="JPEG, PNG o WebP. Máx 10 MB.">
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha del pago">
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Monto real" hint="Si pagaste distinto al esperado.">
            <MoneyInput value={amount} onChange={setAmount} disabled={pending} />
          </FormField>
        </div>
        <PocketPaymentField total={Number(amount) || 0} disabled={pending} onChange={(c, b) => setSplit({ cashAmount: c, bankAmount: b })} />
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
