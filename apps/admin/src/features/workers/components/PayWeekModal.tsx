'use client';

import { Button, Dialog, FormField, Input, MoneyInput, Select, formatCop } from '@pos-tercos/ui';
import { useState, type ChangeEvent } from 'react';
import { payWeekDays } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

type PayMode = 'EFECTIVO' | 'CUENTA' | 'MIXTO';

export function PayWeekModal({
  userId,
  workerName,
  weekStart,
  days,
  suggested,
  remaining,
  onClose,
  onSuccess,
}: {
  userId: string;
  workerName: string;
  weekStart: string;
  /** Días que cubre el abono (etiqueta). Puede ir vacío (abono al neto). */
  days: string[];
  /** Monto sugerido (días seleccionados o restante). */
  suggested: number;
  /** Tope: no se puede abonar más que esto (días + ajustes − abonado). */
  remaining: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<PayMode>('EFECTIVO');
  const [amountInput, setAmountInput] = useState(String(Math.round(suggested)));
  const [cashInput, setCashInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const total = Math.round((Number(amountInput) || 0) * 100) / 100;
  const overRemaining = total > remaining + 0.01;

  // Reparto por bolsillo según el modo.
  const cashAmount =
    mode === 'EFECTIVO' ? total : mode === 'CUENTA' ? 0 : Math.min(Number(cashInput) || 0, total);
  const bankAmount = Math.round((total - cashAmount) * 100) / 100;

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await payWeekDays({ userId, weekStart, days, cashAmount, bankAmount, note: note.trim() || undefined }, file);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el pago.'));
    } finally {
      setPending(false);
    }
  };

  const mixOk = mode !== 'MIXTO' || (cashAmount > 0 && bankAmount > 0);
  const valid = total > 0 && !overRemaining && mixOk;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Abonar a ${workerName}`}
      description={`Restante de la semana: ${formatCop(remaining)}. Se descuenta del bolsillo de tesorería que elijas; queda con comprobante.`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending ? 'Registrando…' : `Pagar ${formatCop(total)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {days.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Cubre los días: <strong className="text-foreground">{days.map((d) => d.slice(8, 10)).join(', ')}</strong> · Semana del {weekStart}
          </div>
        ) : null}

        <FormField
          label="Monto a abonar"
          hint={
            overRemaining
              ? `No puede superar el restante (${formatCop(remaining)}).`
              : 'Podés ajustarlo (incluir bonos, abono parcial, etc.).'
          }
          required
        >
          <div className="flex gap-2">
            <MoneyInput value={amountInput} onChange={setAmountInput} disabled={pending} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAmountInput(String(Math.round(remaining)))}
              disabled={pending}
            >
              Todo (${formatCop(remaining)})
            </Button>
          </div>
        </FormField>

        <FormField label="Forma de pago" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PayMode)} disabled={pending}>
            <option value="EFECTIVO">Efectivo</option>
            <option value="CUENTA">Cuenta (transferencia/QR)</option>
            <option value="MIXTO">Mixto (parte efectivo, parte cuenta)</option>
          </Select>
        </FormField>

        {mode === 'MIXTO' ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Efectivo">
              <MoneyInput value={cashInput} onChange={setCashInput} disabled={pending} placeholder="0" />
            </FormField>
            <FormField label="Cuenta (resto)">
              <Input value={formatCop(bankAmount)} readOnly disabled className="bg-muted/40" />
            </FormField>
          </div>
        ) : null}
        {mode === 'EFECTIVO' || mode === 'MIXTO' ? (
          <p className="text-[11px] text-muted-foreground">
            La parte en efectivo ({formatCop(cashAmount)}) sale del bolsillo Efectivo de tesorería, no del cajón del
            turno. Si la sacaste de la caja, registrá además la salida en el POS.
          </p>
        ) : null}

        <FormField label="Comprobante (imagen)" hint="Opcional">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFile}
            disabled={pending}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary"
          />
        </FormField>
        {preview ? (
          <img src={preview} alt="Comprobante" className="max-h-40 rounded-md border border-border object-contain" />
        ) : null}

        <FormField label="Nota" hint="Opcional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} maxLength={300} />
        </FormField>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
