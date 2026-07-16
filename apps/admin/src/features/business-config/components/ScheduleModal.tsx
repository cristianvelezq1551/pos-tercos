'use client';

import { WEEKDAY_KEYS, type OpeningHours } from '@pos-tercos/types';
import { Button, Dialog, Switch } from '@pos-tercos/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DayRangesRow } from './DayRangesRow';
import { OverridesEditor } from './OverridesEditor';

/** Lunes primero: es como el dueño lee una semana, aunque el dato use 0=domingo. */
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Editor completo del horario. Se guarda entero de una (el horario es una unidad). */
export function ScheduleModal({
  open,
  hours,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  hours: OpeningHours;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (next: OpeningHours) => void;
}) {
  const [draft, setDraft] = useState<OpeningHours>(hours);

  // Al reabrir, arranca de lo guardado: cerrar sin guardar descarta los cambios.
  useEffect(() => {
    if (open) setDraft(hours);
  }, [open, hours]);

  const restDays = WEEKDAY_KEYS.filter((d) => draft.weekly[d].length === 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Horarios de atención"
      description="Un día sin franjas es día de descanso. Se puede cerrar después de medianoche."
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(draft)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar horarios
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div>
          {DAY_ORDER.map((day) => (
            <DayRangesRow
              key={day}
              day={day}
              ranges={draft.weekly[day]}
              onChange={(ranges) =>
                setDraft({ ...draft, weekly: { ...draft.weekly, [day]: ranges } })
              }
            />
          ))}
        </div>

        <HolidayRule
          enabled={draft.restDayHolidayShift}
          restDays={restDays.length}
          onChange={(restDayHolidayShift) => setDraft({ ...draft, restDayHolidayShift })}
        />

        <OverridesEditor
          overrides={draft.overrides}
          onChange={(overrides) => setDraft({ ...draft, overrides })}
        />
      </div>
    </Dialog>
  );
}

function HolidayRule({
  enabled,
  restDays,
  onChange,
}: {
  enabled: boolean;
  restDays: number;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <Switch
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        label="Si el día de descanso cae festivo, se corre al día siguiente"
        description="Ese día se trabaja con el horario del día siguiente, y el siguiente descansa. Los festivos de Colombia se calculan solos, cada año."
      />
      {restDays === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Ahora mismo no hay ningún día de descanso, así que esta regla no hace nada.
        </p>
      ) : null}
      {restDays > 1 ? (
        <p className="mt-3 text-xs text-amber-500">
          Hay {restDays} días de descanso. La regla corre cada uno de forma independiente.
        </p>
      ) : null}
    </div>
  );
}
