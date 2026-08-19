'use client';

import { WEEKDAY_LABELS, type TimeRange, type WeekdayKey } from '@pos-tercos/types';
import { cn, IconButton, Input } from '@pos-tercos/ui';
import { Plus, Trash2 } from 'lucide-react';

const MAX_RANGES = 4;

/** Una fila del editor: el día, sus rangos y el toggle abierto/cerrado. */
export function DayRangesRow({
  day,
  ranges,
  onChange,
}: {
  day: WeekdayKey;
  ranges: TimeRange[];
  onChange: (next: TimeRange[]) => void;
}) {
  const closed = ranges.length === 0;

  const setRange = (i: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-full items-center justify-between gap-3 sm:w-44 sm:shrink-0 sm:pt-1.5">
        <span className="text-sm font-semibold text-foreground">{WEEKDAY_LABELS[day]}</span>
        <button
          type="button"
          onClick={() => onChange(closed ? [{ start: '17:00', end: '23:00' }] : [])}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
            closed
              ? 'bg-muted text-muted-foreground hover:text-foreground'
              : 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25',
          )}
        >
          {closed ? 'Cerrado' : 'Abierto'}
        </button>
      </div>

      {closed ? (
        <p className="text-sm text-muted-foreground sm:pt-1.5">
          Día de descanso.
        </p>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="time"
                value={r.start}
                onChange={(e) => setRange(i, { start: e.target.value })}
                className="w-32"
                aria-label={`${WEEKDAY_LABELS[day]}: hora de apertura`}
              />
              <span className="text-muted-foreground">a</span>
              <Input
                type="time"
                value={r.end}
                onChange={(e) => setRange(i, { end: e.target.value })}
                className="w-32"
                aria-label={`${WEEKDAY_LABELS[day]}: hora de cierre`}
              />
              {r.end <= r.start ? (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  cierra al día siguiente
                </span>
              ) : null}
              {ranges.length > 1 ? (
                <IconButton
                  aria-label="Quitar franja"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(ranges.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              ) : null}
            </div>
          ))}
          {ranges.length < MAX_RANGES ? (
            <button
              type="button"
              onClick={() => onChange([...ranges, { start: '12:00', end: '15:00' }])}
              className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Agregar otra franja
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
