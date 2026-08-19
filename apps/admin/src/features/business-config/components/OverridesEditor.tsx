'use client';

import type { DateOverride } from '@pos-tercos/types';
import { Button, IconButton, Input } from '@pos-tercos/ui';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { formatOverrideDate } from '../lib/hours-format';

const MAX_OVERRIDES = 60;

/** Hoy en YYYY-MM-DD local (nunca toISOString: en Bogotá corre el día). */
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Excepciones por fecha. Le ganan al horario semanal Y a la regla de festivos:
 * son el escape para "este lunes sí abrimos" o "el 24 cerramos".
 */
export function OverridesEditor({
  overrides,
  onChange,
}: {
  overrides: DateOverride[];
  onChange: (next: DateOverride[]) => void;
}) {
  const add = () => {
    // Sin fecha repetida: el backend rechaza dos excepciones el mismo día.
    const used = new Set(overrides.map((o) => o.date));
    let date = todayYmd();
    while (used.has(date)) date = nextDay(date);
    onChange([...overrides, { date, closed: true, ranges: [] }]);
  };

  const patch = (i: number, next: Partial<DateOverride>) =>
    onChange(overrides.map((o, idx) => (idx === i ? { ...o, ...next } : o)));

  const duplicated = new Set(
    overrides.map((o) => o.date).filter((d, i, all) => all.indexOf(d) !== i),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Excepciones por fecha</h3>
          <p className="text-xs text-muted-foreground">
            Mandan sobre todo lo demás, incluida la regla de festivos.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={add}
          disabled={overrides.length >= MAX_OVERRIDES}
        >
          <CalendarPlus className="h-4 w-4" /> Agregar excepción
        </Button>
      </div>

      {overrides.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Sin excepciones. El horario semanal manda.
        </p>
      ) : (
        <ul className="space-y-2">
          {overrides.map((o, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3"
            >
              <Input
                type="date"
                value={o.date}
                onChange={(e) => patch(i, { date: e.target.value })}
                className="w-44"
                aria-label="Fecha de la excepción"
                aria-invalid={duplicated.has(o.date)}
              />
              <button
                type="button"
                onClick={() =>
                  patch(i, {
                    closed: !o.closed,
                    ranges: o.closed ? [{ start: '17:00', end: '23:00' }] : [],
                  })
                }
                className={
                  o.closed
                    ? 'rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive'
                    : 'rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-500'
                }
              >
                {o.closed ? 'Cerrado' : 'Abierto'}
              </button>

              {!o.closed ? (
                <span className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={o.ranges[0]?.start ?? '17:00'}
                    onChange={(e) =>
                      patch(i, {
                        ranges: [{ start: e.target.value, end: o.ranges[0]?.end ?? '23:00' }],
                      })
                    }
                    className="w-32"
                    aria-label="Apertura"
                  />
                  <span className="text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={o.ranges[0]?.end ?? '23:00'}
                    onChange={(e) =>
                      patch(i, {
                        ranges: [{ start: o.ranges[0]?.start ?? '17:00', end: e.target.value }],
                      })
                    }
                    className="w-32"
                    aria-label="Cierre"
                  />
                </span>
              ) : null}

              <Input
                value={o.note ?? ''}
                onChange={(e) => patch(i, { note: e.target.value || undefined })}
                placeholder="Motivo (opcional)"
                className="min-w-0 flex-1"
                aria-label="Motivo"
              />
              <IconButton
                aria-label="Quitar excepción"
                size="sm"
                variant="ghost"
                onClick={() => onChange(overrides.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>

              <p className="w-full text-xs text-muted-foreground">
                {duplicated.has(o.date) ? (
                  <span className="text-destructive">
                    Ya hay otra excepción para esta fecha. Deja una sola.
                  </span>
                ) : (
                  formatOverrideDate(o.date)
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}
