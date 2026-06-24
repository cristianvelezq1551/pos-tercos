'use client';

import type { WeeklyPayrollDay, WeeklyPayrollEntry } from '@pos-tercos/types';
import { Button, Card, Money, cn } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { roleLabel } from '../lib/format';
import { PayWeekModal } from './PayWeekModal';
import { WeekPaymentsList } from './WeekPaymentsList';

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const isSelectable = (d: WeeklyPayrollDay): boolean =>
  d.amount > 0 && !d.isPaid && !d.isFuture;

export function EmployeeWeekCard({
  entry,
  weekStart,
}: {
  entry: WeeklyPayrollEntry;
  weekStart: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);

  const selectableDays = useMemo(() => entry.days.filter(isSelectable), [entry.days]);
  const selectedTotal = useMemo(
    () => entry.days.filter((d) => selected.has(d.date)).reduce((a, d) => a + d.amount, 0),
    [entry.days, selected],
  );

  const toggle = (date: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const selectAllPending = (): void => setSelected(new Set(selectableDays.map((d) => d.date)));
  const clear = (): void => setSelected(new Set());

  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-display text-base font-bold tracking-tight text-foreground">
            {entry.fullName}
          </p>
          <p className="text-xs text-muted-foreground">
            {roleLabel(entry.role)} · <Money amount={entry.valuePerDay} size="xs" />/día
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="text-muted-foreground">
            Semana: <Money amount={entry.owedTotal} size="xs" weight="medium" /> · Pagado{' '}
            <Money amount={entry.paidTotal} size="xs" weight="medium" />
          </p>
          <p className={cn('font-semibold', entry.remaining > 0 ? 'text-warning' : 'text-success')}>
            {entry.remaining > 0 ? (
              <>
                Falta <Money amount={entry.remaining} size="xs" weight="bold" />
              </>
            ) : (
              'Semana saldada'
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {entry.days.map((d) => (
          <DayChip key={d.date} day={d} selected={selected.has(d.date)} onToggle={() => toggle(d.date)} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={selectAllPending}
          disabled={selectableDays.length === 0}
        >
          Seleccionar pendientes
        </Button>
        {selected.size > 0 ? (
          <Button size="sm" variant="ghost" onClick={clear}>
            Limpiar
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setPayOpen(true)} disabled={selected.size === 0}>
          Pagar {selected.size > 0 ? `${selected.size} día${selected.size > 1 ? 's' : ''}` : ''}
          {selected.size > 0 ? (
            <>
              {' · '}
              <Money amount={selectedTotal} size="xs" weight="bold" />
            </>
          ) : null}
        </Button>
      </div>

      {entry.payments.length > 0 ? <WeekPaymentsList payments={entry.payments} /> : null}

      {payOpen ? (
        <PayWeekModal
          userId={entry.userId}
          workerName={entry.fullName}
          weekStart={weekStart}
          days={Array.from(selected).sort()}
          total={selectedTotal}
          onClose={() => setPayOpen(false)}
          onSuccess={() => {
            setPayOpen(false);
            clear();
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function DayChip({
  day,
  selected,
  onToggle,
}: {
  day: WeeklyPayrollDay;
  selected: boolean;
  onToggle: () => void;
}) {
  const selectable = isSelectable(day);
  const label = WEEKDAY[day.weekday];
  const dayNum = Number(day.date.slice(8, 10));

  let tone = 'border-border bg-muted/30 text-muted-foreground';
  let bottom: React.ReactNode = day.status === 'REST' ? 'Descanso' : '—';
  if (day.isPaid) {
    tone = 'border-success/40 bg-success/10 text-success';
    bottom = 'Pagado';
  } else if (selectable) {
    tone = selected
      ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary'
      : 'border-border bg-card text-foreground hover:border-primary/60';
    bottom = <Money amount={day.amount} size="xs" />;
  } else if (day.isFuture && day.status === 'WORKDAY') {
    bottom = 'Por venir';
  }

  return (
    <button
      type="button"
      onClick={selectable ? onToggle : undefined}
      disabled={!selectable}
      className={cn(
        'flex flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors',
        tone,
        !selectable && 'cursor-default',
      )}
      aria-pressed={selected}
    >
      <span className="text-[0.625rem] font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-sm font-bold tabular-nums">{dayNum}</span>
      {day.isHoliday ? (
        <span className="mt-0.5 rounded-full bg-amber-500/15 px-1 text-[0.5625rem] font-semibold text-amber-500">
          Festivo
        </span>
      ) : null}
      <span className="mt-0.5 text-[0.625rem] leading-tight">{bottom}</span>
    </button>
  );
}
