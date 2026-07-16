'use client';

import { WEEKDAY_LABELS, type BusinessConfig, type OpeningHours } from '@pos-tercos/types';
import { Button, Card, Switch } from '@pos-tercos/ui';
import { CalendarClock, Clock, Pencil } from 'lucide-react';
import { useState } from 'react';
import { logError } from '../../../lib/client-log';
import { updateBusinessConfig } from '../api/client';
import { formatDayRanges } from '../lib/hours-format';
import { ScheduleModal } from './ScheduleModal';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * Horarios: resumen + el switch que decide si el horario BLOQUEA los pedidos.
 * No usa `SectionCard` porque acá no hay borrador: el horario se edita en su
 * modal y el switch guarda al toque (es una decisión de una sola cosa).
 */
export function ScheduleSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Parameters<typeof updateBusinessConfig>[0]) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateBusinessConfig(body));
      setOpen(false);
    } catch (e) {
      logError('web-config.schedule', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Clock className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Horarios</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cuándo atiende el local. Se muestran en la web y pueden condicionar los pedidos.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </header>

      <WeekSummary hours={config.hours} />

      {config.hours.restDayHolidayShift ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Si el día de descanso cae festivo, se trabaja y el descanso se corre al día siguiente.
        </p>
      ) : null}

      {config.hours.overrides.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {config.hours.overrides.length}{' '}
          {config.hours.overrides.length === 1 ? 'excepción cargada' : 'excepciones cargadas'} por
          fecha.
        </p>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <Switch
          checked={config.ordersRespectSchedule}
          disabled={saving}
          onChange={(e) => void patch({ ordersRespectSchedule: e.target.checked })}
          label="Fuera de horario, no aceptar pedidos web"
          description={
            config.ordersRespectSchedule
              ? 'Con el local cerrado, la web bloquea el pedido y le dice al cliente cuándo abrís.'
              : 'Ahora mismo se aceptan pedidos a cualquier hora, incluso con el local cerrado.'
          }
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <ScheduleModal
        open={open}
        hours={config.hours}
        saving={saving}
        error={error}
        onClose={() => setOpen(false)}
        onSave={(hours: OpeningHours) => void patch({ hours })}
      />
    </Card>
  );
}

function WeekSummary({ hours }: { hours: OpeningHours }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {DAY_ORDER.map((day) => {
        const ranges = hours.weekly[day];
        const closed = ranges.length === 0;
        return (
          <li key={day} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm font-medium text-foreground">{WEEKDAY_LABELS[day]}</span>
            <span
              className={
                closed
                  ? 'text-sm text-muted-foreground'
                  : 'text-sm tabular-nums text-foreground'
              }
            >
              {formatDayRanges(ranges)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
