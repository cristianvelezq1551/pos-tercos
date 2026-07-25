'use client';

import { POCKET_LABELS, type TreasuryMovement } from '@pos-tercos/types';
import { Button, Card, EmptyState, Money, Section, cn, formatDate } from '@pos-tercos/ui';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { voidTreasuryMovement } from '../api/client';
import { AdjustmentModal } from './AdjustmentModal';
import { TransferModal } from './TransferModal';
import { getErrorMessage } from '../../../lib/errors';

export function TreasuryMovements({ movements }: { movements: TreasuryMovement[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<'transfer' | 'adjustment' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onVoid = async (id: string): Promise<void> => {
    setBusy(id);
    setError(null);
    try {
      await voidTreasuryMovement(id);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo anular el movimiento.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      eyebrow="Movimientos"
      title="Traspasos y ajustes"
      size="md"
      actions={
        <span className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setModal('transfer')}>
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} /> Traspaso
          </Button>
          <Button size="sm" variant="outline" onClick={() => setModal('adjustment')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} /> Ajuste
          </Button>
        </span>
      }
    >
      {movements.length === 0 ? (
        <EmptyState
          title="Sin movimientos manuales"
          description="Registrá un traspaso (mover plata entre efectivo y cuenta) o un ajuste cuando haga falta."
        />
      ) : (
        <Card className="px-5 py-3">
          <ul className="divide-y divide-border">
            {movements.map((m) => {
              const voided = m.status === 'VOIDED';
              return (
                <li
                  key={m.id}
                  className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm', voided && 'opacity-50')}
                >
                  <span className={cn('font-semibold text-foreground', voided && 'line-through')}>
                    {m.kind === 'TRANSFER'
                      ? `${POCKET_LABELS[m.fromPocket!]} → ${POCKET_LABELS[m.toPocket!]}`
                      : `Ajuste ${POCKET_LABELS[m.pocket!]}`}
                  </span>
                  <Money amount={m.amount} size="sm" weight="bold" />
                  <span className="text-muted-foreground">{m.reason}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(m.occurredAt, 'datetime')}</span>
                  {voided ? <span className="text-xs font-semibold text-destructive">ANULADO</span> : null}
                  <span className="flex-1" />
                  {!voided ? (
                    <button
                      type="button"
                      onClick={() => onVoid(m.id)}
                      disabled={busy === m.id}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      {busy === m.id ? 'Anulando…' : 'Anular'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
        </Card>
      )}

      {modal === 'transfer' ? (
        <TransferModal onClose={() => setModal(null)} onSuccess={() => { setModal(null); router.refresh(); }} />
      ) : null}
      {modal === 'adjustment' ? (
        <AdjustmentModal onClose={() => setModal(null)} onSuccess={() => { setModal(null); router.refresh(); }} />
      ) : null}
    </Section>
  );
}
