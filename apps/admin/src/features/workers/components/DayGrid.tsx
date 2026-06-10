'use client';

import type { PanelDay } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

type Status = 'default' | 'absence' | 'custom' | 'future' | 'rest';

function statusOf(day: PanelDay): Status {
  if (day.isFuture) return 'future';
  if (day.isRest) return 'rest';
  if (day.isAbsence) return 'absence';
  if (!day.isDefault) return 'custom';
  return 'default';
}

const CHIP_CLASS: Record<Status, string> = {
  default: 'border-border bg-muted/30 text-foreground hover:border-primary/50',
  absence: 'border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive',
  custom: 'border-warning-border bg-warning-bg/40 text-warning hover:border-warning',
  rest: 'border-border bg-muted/10 text-muted-foreground opacity-70 hover:opacity-100',
  future: 'border-dashed border-border bg-transparent text-muted-foreground opacity-60 hover:opacity-100',
};

const STATUS_LABEL: Record<Status, string> = {
  default: 'Trabajó',
  absence: 'No asistió',
  custom: 'Ajustado',
  rest: 'Descanso',
  future: 'Pendiente',
};

const LEGEND: Array<{ status: Status; dot: string }> = [
  { status: 'default', dot: 'bg-muted-foreground/50' },
  { status: 'absence', dot: 'bg-destructive' },
  { status: 'custom', dot: 'bg-warning' },
  { status: 'rest', dot: 'bg-muted-foreground/30' },
  { status: 'future', dot: 'border border-dashed border-muted-foreground' },
];

/** Calendario compacto de días del mes: cada chip es editable (excepción del día). */
export function DayGrid({ days, onPick }: { days: PanelDay[]; onPick: (day: PanelDay) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
        {days.map((day) => {
          const status = statusOf(day);
          const [, , dd] = day.workDate.split('-');
          const weekday = new Date(`${day.workDate}T00:00:00`).toLocaleDateString('es-CO', {
            weekday: 'short',
          });
          return (
            <button
              key={day.workDate}
              type="button"
              onClick={() => onPick(day)}
              title={day.note ?? undefined}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2 text-center transition ${CHIP_CLASS[status]}`}
            >
              <span className="text-[11px] capitalize leading-none">
                {weekday.replace('.', '')} {Number(dd)}
              </span>
              <span className="text-xs font-semibold tabular-nums leading-tight">
                {day.isFuture || (day.isRest && day.amount === 0) ? '—' : formatCop(day.amount)}
              </span>
              <span className="text-[9px] uppercase tracking-wide leading-none">
                {STATUS_LABEL[status]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {LEGEND.map((l) => (
          <span key={l.status} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${l.dot}`} />
            {STATUS_LABEL[l.status]}
          </span>
        ))}
      </div>
    </div>
  );
}
