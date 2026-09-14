'use client';

import type { FinancePendingFixedCost, FixedCost } from '@pos-tercos/types';
import { Money, formatCop } from '@pos-tercos/ui';
import { AlertTriangle, CalendarClock, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { monthsOverdue } from '../lib/vencimientos';
import { PendingCostCard } from './PendingCostCard';

/**
 * Períodos pendientes por pagar de cada costo fijo, con su rango de fechas y
 * vigencia. Los períodos de meses ANTERIORES se resaltan como VENCIDOS (amber
 * 1 mes, rojo 2+); el del mes en curso queda neutro. Cada período paga solo.
 */
export function PendingPeriodsPanel({
  costs,
  pending,
  onPay,
}: {
  costs: FixedCost[];
  pending: FinancePendingFixedCost[];
  onPay: (period: FinancePendingFixedCost) => void;
}) {
  // Mes en curso se resuelve tras montar → evita mismatch SSR/cliente. Hasta
  // entonces nada se marca vencido (se pinta neutro un frame).
  const [nowYm, setNowYm] = useState<number | null>(null);
  useEffect(() => {
    const d = new Date();
    setNowYm(d.getFullYear() * 12 + (d.getMonth() + 1));
  }, []);

  const byCost = new Map<string, FinancePendingFixedCost[]>();
  for (const p of pending) {
    const arr = byCost.get(p.fixedCostId);
    if (arr) arr.push(p);
    else byCost.set(p.fixedCostId, [p]);
  }
  const withPending = costs.filter((c) => byCost.has(c.id));
  const grandTotal = pending.reduce((a, p) => a + p.amount, 0);

  const overdue = pending.filter((p) => monthsOverdue(nowYm, p.periodYear, p.periodMonth) > 0);
  const overdueTotal = overdue.reduce((a, p) => a + p.amount, 0);

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Períodos pendientes por pagar
          </h2>
        </div>
        {withPending.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            Total: <Money amount={grandTotal} weight="bold" />
          </span>
        ) : null}
      </header>

      {/* Alerta global de atrasos de meses anteriores. */}
      {overdue.length > 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">
              {overdue.length} período{overdue.length > 1 ? 's' : ''} vencido
              {overdue.length > 1 ? 's' : ''}
            </strong>{' '}
            de meses anteriores — <strong className="font-semibold">{formatCop(overdueTotal)}</strong>{' '}
            atrasado. Paga primero lo más viejo.
          </span>
        </div>
      ) : null}

      {withPending.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          Estás al día con los costos fijos. No hay períodos pendientes hasta este mes.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {withPending.map((c) => (
            <PendingCostCard
              key={c.id}
              cost={c}
              periods={byCost.get(c.id) ?? []}
              nowYm={nowYm}
              onPay={onPay}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se listan los períodos sin pagar hasta el mes en curso (los meses futuros aparecen
        cuando llegan). El histórico se limita a los últimos 6 meses.
      </p>
    </section>
  );
}
