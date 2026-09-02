'use client';

import { comprobantesDe, type PayableCommitment } from '@pos-tercos/types';
import {
  Badge, Button, Card, EmptyState, Input, Money, MoneyInput, Section, cn, formatDate } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelPayable, createPayable } from '../api/client';
import { PayableProofsDialog } from './PayableProofsDialog';
import { PayPayableModal } from './PayPayableModal';
import { getErrorMessage } from '../../../lib/errors';

export function PayablesView({ payables }: { payables: PayableCommitment[] }) {
  const router = useRouter();
  const pending = payables.filter((p) => p.status === 'PENDING');
  const history = payables.filter((p) => p.status !== 'PENDING');
  const [paying, setPaying] = useState<PayableCommitment | null>(null);
  const [viendo, setViendo] = useState<PayableCommitment | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async (id: string): Promise<void> => {
    setCancelling(id);
    setError(null);
    try {
      await cancelPayable(id);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cancelar el compromiso.'));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      <CreateForm onDone={() => router.refresh()} />

      <Section eyebrow="Pendientes" title="Por pagar" size="md">
        {pending.length === 0 ? (
          <EmptyState title="Sin compromisos pendientes" description="Registra lo que el negocio le debe a alguien." />
        ) : (
          <Card className="px-5 py-3">
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-semibold text-foreground">{p.beneficiary}</span>
                  <span className="text-muted-foreground">{p.description}</span>
                  <Money amount={p.amount} size="sm" weight="bold" />
                  {/* Solo se rotula la excepción: marcar "gasto" en casi todos
                      sería ruido, y lo que hay que poder ver de un vistazo es
                      cuál NO va a bajar el resultado del mes. */}
                  {!p.isExpense ? (
                    <Badge tone="neutral" size="sm">
                      Devolución
                    </Badge>
                  ) : null}
                  <span className="flex-1" />
                  <Button size="sm" onClick={() => setPaying(p)}>Pagar</Button>
                  <button
                    type="button"
                    onClick={() => onCancel(p.id)}
                    disabled={cancelling === p.id}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    {cancelling === p.id ? 'Cancelando…' : 'Cancelar'}
                  </button>
                </li>
              ))}
            </ul>
            {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
          </Card>
        )}
      </Section>

      {history.length > 0 ? (
        <Section eyebrow="Historial" title="Pagados / cancelados" size="md">
          <Card className="px-5 py-3">
            <ul className="divide-y divide-border">
              {history.map((p) => (
                <li key={p.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm', p.status === 'CANCELLED' && 'opacity-50')}>
                  <span className="font-semibold text-foreground">{p.beneficiary}</span>
                  <span className="text-muted-foreground">{p.description}</span>
                  <Money amount={p.amount} size="sm" weight="bold" />
                  {/* Solo se rotula la excepción: marcar "gasto" en casi todos
                      sería ruido, y lo que hay que poder ver de un vistazo es
                      cuál NO va a bajar el resultado del mes. */}
                  {!p.isExpense ? (
                    <Badge tone="neutral" size="sm">
                      Devolución
                    </Badge>
                  ) : null}
                  {p.status === 'PAID' ? (
                    <span className="text-xs text-muted-foreground">
                      {p.cashAmount > 0 && p.bankAmount > 0
                        ? `Efectivo ${p.cashAmount} · Cuenta ${p.bankAmount}`
                        : p.cashAmount > 0 ? 'Efectivo' : 'Cuenta'} · {formatDate(p.paidAt, 'short')}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-destructive">CANCELADO</span>
                  )}
                  <span className="flex-1" />
                  {p.status === 'PAID' ? (
                    <button
                      type="button"
                      onClick={() => setViendo(p)}
                      className="text-xs text-primary hover:underline"
                    >
                      {comprobantesDe(p) > 1
                        ? `${comprobantesDe(p)} comprobantes`
                        : p.hasProof
                          ? 'Comprobante'
                          : 'Agregar comprobante'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      {viendo ? (
        <PayableProofsDialog
          payable={viendo}
          onClose={() => setViendo(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {paying ? (
        <PayPayableModal
          payable={paying}
          onClose={() => setPaying(null)}
          onSuccess={() => { setPaying(null); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [beneficiary, setBeneficiary] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isExpense, setIsExpense] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = beneficiary.trim().length > 0 && description.trim().length > 0 && Number(amount) > 0;

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await createPayable({
        beneficiary: beneficiary.trim(),
        description: description.trim(),
        amount: Number(amount),
        isExpense,
      });
      setBeneficiary('');
      setDescription('');
      setAmount('');
      setIsExpense(true);
      onDone();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo crear.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <p className="text-sm font-semibold text-foreground">Nuevo compromiso por pagar</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
        <label className="text-xs text-muted-foreground">
          A quién (responsable)
          <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} disabled={pending} placeholder="Cristian / Pablo / …" className="mt-1" />
        </label>
        <label className="text-xs text-muted-foreground">
          Concepto
          <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} placeholder="Préstamo, reembolso, …" className="mt-1" />
        </label>
        <label className="text-xs text-muted-foreground">
          Monto
          <div className="mt-1"><MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" /></div>
        </label>
        <Button onClick={submit} disabled={pending || !valid}>{pending ? 'Guardando…' : 'Agregar'}</Button>
      </div>

      {/* Sin esta distinción, devolver un préstamo se leería como una pérdida
          del mes: esa plata ya se había recibido. */}
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={isExpense}
          onChange={(e) => setIsExpense(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium text-foreground">Es un gasto del negocio</span>
          <span className="block text-muted-foreground">
            Desmarca solo si estás devolviendo plata que te prestaron. Los gastos bajan el
            resultado del mes en que los pagas; las devoluciones no.
          </span>
        </span>
      </label>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </Card>
  );
}
