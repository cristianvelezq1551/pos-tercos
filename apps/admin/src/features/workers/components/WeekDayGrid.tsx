'use client';

import type { WeeklyPayrollDay, WeeklyPayrollEntry } from '@pos-tercos/types';
import { Money, cn } from '@pos-tercos/ui';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { DayOverrideDialog } from './DayOverrideDialog';

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const isSelectable = (d: WeeklyPayrollDay): boolean => d.amount > 0 && !d.isPaid && !d.isFuture;

/** Grilla de días de la semana. Tocar un día lo selecciona para el abono; el
 *  lápiz (solo DIARIO, días ya pasados) edita su valor (llegada tarde/ausencia). */
export function WeekDayGrid({
  entry,
  selected,
  onToggle,
}: {
  entry: WeeklyPayrollEntry;
  selected: Set<string>;
  onToggle: (date: string) => void;
}) {
  const [editDay, setEditDay] = useState<WeeklyPayrollDay | null>(null);
  const canEdit = entry.payType === 'DAILY';

  return (
    <>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {entry.days.map((d) => (
          <div key={d.date} className="relative">
            <DayChip day={d} selected={selected.has(d.date)} onToggle={() => onToggle(d.date)} />
            {canEdit && !d.isFuture ? (
              <button
                type="button"
                onClick={() => setEditDay(d)}
                aria-label={`Editar ${d.date}`}
                className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {editDay ? (
        <DayOverrideDialog
          userId={entry.userId}
          workerName={entry.fullName}
          date={editDay.date}
          defaultAmount={entry.valuePerDay}
          currentAmount={editDay.amount}
          hasOverride={editDay.hasOverride}
          onClose={() => setEditDay(null)}
        />
      ) : null}
    </>
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
  } else if (day.hasOverride && day.amount === 0) {
    bottom = 'Ausente';
  }

  return (
    <button
      type="button"
      onClick={selectable ? onToggle : undefined}
      disabled={!selectable}
      className={cn(
        'flex w-full flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors',
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
      {day.hasOverride && !day.isPaid ? (
        <span className="mt-0.5 rounded-full bg-blue-500/15 px-1 text-[0.5625rem] font-semibold text-blue-400">
          Editado
        </span>
      ) : null}
      <span className="mt-0.5 text-[0.625rem] leading-tight">{bottom}</span>
    </button>
  );
}
