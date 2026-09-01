import { businessWallClock } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';

const DAY_MS = 86_400_000;
/** Cerrado hace más de esto → destructive. */
const OVERDUE_DAYS = 30;
/** Hasta esto se considera reciente → sin badge (neutral). */
const RECENT_DAYS = 7;

/**
 * Último día del mes del período — para pendientes que solo traen year/month.
 *
 * Se ancla al MEDIODÍA UTC, no a la medianoche local del runtime. Este badge se
 * pinta en el servidor (Vercel, UTC) y otra vez en el navegador (Bogotá): con
 * `new Date(year, month, 0)` los dos obtenían instantes separados por 5 horas y
 * la cuenta de días salía distinta —"hace 32 d" arriba, "hace 31 d" abajo—, que
 * es el error de hidratación de React #418 que aparecía en /finanzas/pagos.
 * El mediodía cae en el mismo día calendario en cualquier zona razonable.
 */
export function endOfPeriodMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 12));
}

/**
 * Días completos transcurridos, contados en días de CALENDARIO del local.
 *
 * Comparar instantes con `Date.now()` haría que el número dependa de CUÁNDO se
 * renderiza: el servidor pinta el HTML y el navegador lo hidrata segundos
 * después, y cerca de un borde el `Math.floor` cae de un lado distinto. Contar
 * días de calendario deja el resultado igual en los dos lados durante todo el
 * día — la única ventana que queda es hidratar justo cruzando la medianoche.
 */
function diasTranscurridos(desde: Date): number {
  const hoy = businessWallClock();
  const dia = businessWallClock(desde);
  const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const b = Date.UTC(dia.getFullYear(), dia.getMonth(), dia.getDate());
  return Math.floor((a - b) / DAY_MS);
}

/**
 * Badge tonal de antigüedad para pendientes del cockpit:
 * >30 días → destructive · 8–30 días → warning · ≤7 días o sin fecha → nada.
 */
export function AgingBadge({ since }: { since: Date | string | null }) {
  if (!since) return null;
  const date = typeof since === 'string' ? new Date(since) : since;
  if (Number.isNaN(date.getTime())) return null;
  const days = diasTranscurridos(date);
  if (days <= RECENT_DAYS) return null;
  const overdue = days > OVERDUE_DAYS;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums',
        overdue
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-warning-border bg-warning-bg/40 text-warning',
      )}
      title={overdue ? 'Pendiente hace más de 30 días' : 'Pendiente hace más de una semana'}
    >
      hace {days} d
    </span>
  );
}
