'use client';

import { Button, Dialog, FormField, Input, MoneyInput, PinField, Select, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { addAdjustment } from '../api/client';

const CONCEPTS = [
  'Bono',
  'Excedente / hora extra',
  'Regalo',
  'Ausencia (descuento)',
  'Préstamo (descuento)',
  'Otro',
];

/** Conceptos que por defecto restan (descuento) al pago. */
const NEGATIVE_BY_DEFAULT = ['Ausencia (descuento)', 'Préstamo (descuento)'];

interface AdjustmentDialogProps {
  userId: string;
  periodStart: string; // pago (día 1/8/16/23) al que se agrega
  periodLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdjustmentDialog({ userId, periodStart, periodLabel, onClose, onSuccess }: AdjustmentDialogProps) {
  const [concept, setConcept] = useState('Bono');
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onConceptChange = (value: string): void => {
    setConcept(value);
    setSign(NEGATIVE_BY_DEFAULT.includes(value) ? '-' : '+');
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const value = (sign === '-' ? -1 : 1) * Number(amount);
      await addAdjustment(userId, { periodStart, concept, amount: value, note: note.trim() || undefined }, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar la novedad.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Agregar novedad"
      description={`Quincena ${periodLabel} · suma un extra (bono, hora extra) o restá (ausencia, descuento)`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !amount || Number(amount) <= 0 || !isValidPin(pin)}>
            {pending ? 'Guardando…' : 'Agregar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Concepto">
          <Select value={concept} onChange={(e) => onConceptChange(e.target.value)} disabled={pending}>
            {CONCEPTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <FormField label="Signo">
            <Select value={sign} onChange={(e) => setSign(e.target.value as '+' | '-')} disabled={pending}>
              <option value="+">+ Suma (bono)</option>
              <option value="-">− Resta (descuento)</option>
            </Select>
          </FormField>
          <FormField label="Monto">
            <MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" />
          </FormField>
        </div>
        <FormField label="Nota" hint="Opcional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        <PinField value={pin} onChange={setPin} disabled={pending} />
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
