'use client';

import type { FinancePendingFixedCost, FixedCost, FixedCostFrequency } from '@pos-tercos/types';
import { Badge, Button, Money, cn, formatCop } from '@pos-tercos/ui';
import { AlertTriangle, CalendarClock, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "15 mar 2026" desde un YYYY-MM-DD (parseo por partes, sin desfase de zona). */
function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES[(m ?? 1) - 1]} ${y}`;
}

/** Rango de fechas cubierto por un período según la frecuencia del costo. */
function periodRange(
  frequency: FixedCostFrequency,
  year: number,
  month: number,
  startedAt: string | null,
): string {
  if (frequency === 'ANNUAL') return `1 ene – 31 dic ${year}`;
  if (frequency === 'ONE_TIME') return startedAt ? fmtYmd(startedAt) : `${MESES[month - 1]} ${year}`;
  // MONTHLY: día 0 del mes siguiente = último día del mes actual.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `1 – ${lastDay} ${MESES[month - 1]} ${year}`;
}

/** Vigencia del costo: desde startedAt hasta endedAt (o "sin fecha de fin"). */
function coverage(startedAt: string | null, endedAt: string | null): string {
  const desde = startedAt ? `desde ${fmtYmd(startedAt)}` : 'sin fecha de inicio';
  const hasta = endedAt ? `hasta ${fmtYmd(endedAt)}` : 'sin fecha de fin (recurrente)';
  return `${desde} · ${hasta}`;
}

/** Meses de atraso del período respecto al mes en curso (0 = mes actual). */
function monthsOverdue(nowYm: number | null, year: number, month: number): number {
  if (nowYm === null) return 0;
  return nowYm - (year * 12 + month);
}

/** Tono por severidad del atraso: 1 mes → warning (amber); 2+ → destructive. */
function overdueTone(m: number): { row: string; badge: string } {
  if (m >= 2) {
    return {
      row: 'border-destructive/30 bg-destructive/10',
      badge: 'border-destructive/40 bg-destructive/10 text-destructive',
    };
  }
  return {
    row: 'border-warning-border bg-warning-bg/25',
    badge: 'border-warning-border bg-warning-bg/40 text-warning',
  };
}

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
          {withPending.map((c) => {
            const periods = byCost.get(c.id) ?? [];
            const overdueCount = periods.filter(
              (p) => monthsOverdue(nowYm, p.periodYear, p.periodMonth) > 0,
            ).length;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-2xl border bg-card p-4',
                  overdueCount > 0 ? 'border-warning-border/60' : 'border-border',
                )}
              >
                <header className="mb-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {overdueCount > 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-warning">
                        {overdueCount} vencido{overdueCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {periods.length} pendiente{periods.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.category} · Vigente {coverage(c.startedAt, c.endedAt)}
                  </p>
                </header>
                <ul className="space-y-1.5">
                  {periods.map((p) => {
                    const m = monthsOverdue(nowYm, p.periodYear, p.periodMonth);
                    const isOverdue = m > 0;
                    const tone = overdueTone(m);
                    return (
                      <li
                        key={`${p.periodYear}|${p.periodMonth}`}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
                          isOverdue ? tone.row : 'border-transparent bg-muted/30',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {isOverdue ? (
                              <AlertTriangle
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  m >= 2 ? 'text-destructive' : 'text-warning',
                                )}
                              />
                            ) : null}
                            <p className="truncate text-sm font-medium text-foreground">
                              {p.periodLabel.replace(`${c.name} · `, '')}
                            </p>
                            {isOverdue ? (
                              <Badge
                                size="sm"
                                className={cn('shrink-0 border', tone.badge)}
                              >
                                Vencido · hace {m} mes{m > 1 ? 'es' : ''}
                              </Badge>
                            ) : (
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Mes en curso
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {periodRange(c.frequency, p.periodYear, p.periodMonth, c.startedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Money amount={p.amount} weight="semibold" />
                          <Button variant="default" onClick={() => onPay(p)} className="px-6">
                            Pagar
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se listan los períodos sin pagar hasta el mes en curso (los meses futuros aparecen
        cuando llegan). El histórico se limita a los últimos 6 meses.
      </p>
    </section>
  );
}
