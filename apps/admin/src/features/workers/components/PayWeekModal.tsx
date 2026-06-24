'use client';

import { Button, Dialog, FormField, Input, MoneyInput, PinField, Select, formatCop, isValidPin } from '@pos-tercos/ui';
import { useState, type ChangeEvent } from 'react';
import { payWeekDays } from '../api/client';

type PayMode = 'EFECTIVO' | 'CUENTA' | 'MIXTO';

export function PayWeekModal({
  userId,
  workerName,
  weekStart,
  days,
  total,
  onClose,
  onSuccess,
}: {
  userId: string;
  workerName: string;
  weekStart: string;
  days: string[];
  total: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<PayMode>('EFECTIVO');
  const [cashInput, setCashInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    if (!file) {
      setError('Seleccioná el comprobante (imagen).');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await payWeekDays({ userId, weekStart, days, cashAmount, bankAmount, note: note.trim() || undefined }, file, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
    } finally {
      setPending(false);
    }
  };

  const mixOk = mode !== 'MIXTO' || (cashAmount > 0 && bankAmount > 0);
  const valid = file !== null && isValidPin(pin) && days.length > 0 && mixOk;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Pagar ${days.length} día${days.length > 1 ? 's' : ''} · ${workerName}`}
      description={`Total: ${formatCop(total)}. La porción en efectivo sale de la caja abierta; queda con comprobante.`}
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
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Días: <strong className="text-foreground">{days.map((d) => d.slice(8, 10)).join(', ')}</strong> · Semana del {weekStart}
        </div>

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
          <p className="text-[11px] text-amber-500">
            La parte en efectivo ({formatCop(cashAmount)}) sale de la caja abierta. Si no hay caja abierta, no se puede.
          </p>
        ) : null}

        <FormField label="Comprobante (imagen)" required>
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

        <FormField label="PIN de aprobación (Dueño)" required>
          <PinField value={pin} onChange={setPin} disabled={pending} />
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
