import { AlertTriangle, RotateCcw } from 'lucide-react';
import { VOID_OUTCOMES, type VoidOutcome } from '../lib/void-outcome';

/**
 * La pregunta que decide si la anulación cuesta o no. Va con la consecuencia
 * escrita al lado: sin eso las dos opciones se ven iguales y la diferencia
 * —que una borra una pérdida real de los libros— es invisible.
 */
export function VoidOutcomePicker({
  value,
  onChange,
  disabled,
}: {
  value: VoidOutcome | null;
  onChange: (v: VoidOutcome) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-foreground">
        ¿El cliente se llevó la comida?
      </legend>
      {VOID_OUTCOMES.map((o) => {
        const activo = value === o.value;
        return (
          <label
            key={o.value}
            className={
              'flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors ' +
              (activo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40')
            }
          >
            <input
              type="radio"
              name="void-outcome"
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              checked={activo}
              onChange={() => onChange(o.value)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{o.label}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {o.consequence}
              </span>
            </span>
          </label>
        );
      })}

      <ImpactoDeLaEleccion value={value} />
    </fieldset>
  );
}

/**
 * Lo que va a pasar con el inventario, en grande y con color, DESPUÉS de
 * elegir. La consecuencia de al lado de cada opción se lee mientras se
 * compara; esto es la confirmación: una de las dos deja los insumos gastados
 * y el cajero tiene que saberlo antes de confirmar, no después.
 */
function ImpactoDeLaEleccion({ value }: { value: VoidOutcome | null }) {
  const elegida = VOID_OUTCOMES.find((o) => o.value === value);
  if (!elegida) return null;
  const { titulo, detalle, tono } = elegida.impact;
  const perdida = tono === 'perdida';
  const Icono = perdida ? AlertTriangle : RotateCcw;

  return (
    <div
      role="status"
      className={
        'mt-3 flex gap-2.5 rounded-lg border px-3 py-2.5 ' +
        (perdida
          ? 'border-destructive/40 bg-destructive/10'
          : 'border-success-border bg-success-bg/30')
      }
    >
      <Icono
        className={'mt-0.5 h-4 w-4 shrink-0 ' + (perdida ? 'text-destructive' : 'text-success')}
        strokeWidth={2}
        aria-hidden
      />
      <span className="min-w-0">
        <span
          className={
            'block text-sm font-semibold ' + (perdida ? 'text-destructive' : 'text-success')
          }
        >
          {titulo}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-foreground">{detalle}</span>
      </span>
    </div>
  );
}
