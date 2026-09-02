'use client';

import type { PayableCommitment } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, MoneyInput, Select, formatCop } from '@pos-tercos/ui';
import { useState } from 'react';
import { payPayable } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';
import { ProofFilesField } from '../../../components/ProofFilesField';

type PayMode = 'EFECTIVO' | 'CUENTA' | 'MIXTO';

export function PayPayableModal({
  payable,
  onClose,
  onSuccess,
}: {
  // Solo se usan estos 4 campos → acepta tanto PayableCommitment (vista de
  // compromisos) como FinancePendingPayable (cockpit de Pagos y cobros).
  payable: Pick<PayableCommitment, 'id' | 'beneficiary' | 'description' | 'amount'>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const total = payable.amount;
  const [mode, setMode] = useState<PayMode>('CUENTA');
  const [cashInput, setCashInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashAmount = mode === 'EFECTIVO' ? total : mode === 'CUENTA' ? 0 : Math.min(Number(cashInput) || 0, total);
  const bankAmount = Math.round((total - cashAmount) * 100) / 100;


  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await payPayable(payable.id, { cashAmount, bankAmount, note: note.trim() || undefined }, files);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el pago.'));
    } finally {
      setPending(false);
    }
  };

  const mixOk = mode !== 'MIXTO' || (cashAmount > 0 && bankAmount > 0);

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Pagar a ${payable.beneficiary}`}
      description={`${payable.description} · ${formatCop(total)}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !mixOk}>{pending ? 'Registrando…' : `Pagar ${formatCop(total)}`}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Forma de pago" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PayMode)} disabled={pending}>
            <option value="CUENTA">Cuenta (transferencia/QR)</option>
            <option value="EFECTIVO">Efectivo</option>
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

        <ProofFilesField
          label="Comprobante (opcional)"
          files={files}
          onChange={setFiles}
          disabled={pending}
        />

        <FormField label="Nota" hint="Opcional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} maxLength={300} />
        </FormField>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Dialog>
  );
}
