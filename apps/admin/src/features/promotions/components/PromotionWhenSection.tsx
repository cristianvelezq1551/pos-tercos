import { Section, Field, inputClass, type FormState } from './PromotionFormHelpers';

const DAYS: { mask: number; label: string }[] = [
  { mask: 1, label: 'L' },
  { mask: 2, label: 'M' },
  { mask: 4, label: 'X' },
  { mask: 8, label: 'J' },
  { mask: 16, label: 'V' },
  { mask: 32, label: 'S' },
  { mask: 64, label: 'D' },
];

interface PromotionWhenSectionProps {
  state: FormState;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onToggleDay: (mask: number) => void;
}

export function PromotionWhenSection({ state, onUpdate, onToggleDay }: PromotionWhenSectionProps) {
  return (
    <Section title="Cuándo aplica">
      <Field label="Días de la semana" required>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label
              key={d.mask}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                (state.daysMask & d.mask) !== 0
                  ? 'border-primary bg-destructive/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted/40'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={(state.daysMask & d.mask) !== 0}
                onChange={() => onToggleDay(d.mask)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Mask actual: {state.daysMask}{state.daysMask === 127 ? ' (todos)' : ''}
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Hora inicio (24h)" required>
          <input
            type="time"
            required
            value={state.timeStart}
            onChange={(e) => onUpdate('timeStart', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Hora fin (24h)" required>
          <input
            type="time"
            required
            value={state.timeEnd}
            onChange={(e) => onUpdate('timeEnd', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Si la hora fin es menor que inicio, la ventana cruza medianoche
        (ej. 22:00 → 02:00).
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigente desde (opcional)">
          <input
            type="date"
            value={state.activeFrom}
            onChange={(e) => onUpdate('activeFrom', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Vigente hasta (opcional)">
          <input
            type="date"
            value={state.activeTo}
            onChange={(e) => onUpdate('activeTo', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
    </Section>
  );
}
