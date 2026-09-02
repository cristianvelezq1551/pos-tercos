'use client';

import { comprobantesDe, type PayrollWeekPayment } from '@pos-tercos/types';
import { Money, cn, formatCop, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { WeekPaymentProofsDialog } from './WeekPaymentProofsDialog';
import { VoidWeekPaymentDialog } from './VoidWeekPaymentDialog';

export function WeekPaymentsList({ payments }: { payments: PayrollWeekPayment[] }) {
  const [voiding, setVoiding] = useState<PayrollWeekPayment | null>(null);
  const [viendo, setViendo] = useState<PayrollWeekPayment | null>(null);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="caps mb-2 text-[0.6875rem] text-muted-foreground">Abonos de la semana</p>
      <ul className="space-y-1.5">
        {payments.map((p) => {
          const voided = p.status === 'VOIDED';
          return (
            <li
              key={p.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs',
                voided && 'opacity-50',
              )}
            >
              <span className={cn('font-semibold text-foreground', voided && 'line-through')}>
                <Money amount={p.amount} size="xs" weight="bold" />
              </span>
              <span className="text-muted-foreground">
                {p.cashAmount > 0 && p.bankAmount > 0
                  ? `Efectivo ${formatCop(p.cashAmount)} · Cuenta ${formatCop(p.bankAmount)}`
                  : p.cashAmount > 0
                    ? 'Efectivo'
                    : 'Cuenta'}
              </span>
              <span className="text-muted-foreground">
                días {p.paidDays.map((d) => d.slice(8, 10)).join(', ')}
              </span>
              <span className="text-muted-foreground">{formatDate(p.paidAt, 'datetime')}</span>
              {voided ? <span className="font-semibold text-destructive">ANULADO</span> : null}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setViendo(p)}
                className="text-primary hover:underline"
              >
                {comprobantesDe(p) > 1
                  ? `Ver ${comprobantesDe(p)} comprobantes`
                  : p.hasProof
                    ? 'Ver comprobante'
                    : 'Agregar comprobante'}
              </button>
              {!voided ? (
                <button
                  type="button"
                  onClick={() => setVoiding(p)}
                  className="text-destructive hover:underline"
                >
                  Anular
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {viendo ? (
        <WeekPaymentProofsDialog payment={viendo} onClose={() => setViendo(null)} />
      ) : null}

      {voiding ? (
        <VoidWeekPaymentDialog payment={voiding} onClose={() => setVoiding(null)} />
      ) : null}
    </div>
  );
}
