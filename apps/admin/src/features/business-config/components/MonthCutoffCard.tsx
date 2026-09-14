import { CAMBIAR_INICIO_DE_MES_HABILITADO } from '@pos-tercos/types';
import { Card, formatDate } from '@pos-tercos/ui';
import { CalendarRange } from 'lucide-react';
import { MonthCutoffEditor } from './MonthCutoffEditor';

interface MonthCutoffCardProps {
  /** Día de corte actual (1–28). Solo se usa si el campo está habilitado. */
  monthStartDay: number;
  /** Ventana vigente del mes mostrado (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
}

/**
 * Qué ventana de días está mirando el estado financiero.
 *
 * Decisión del dueño (2026-09-14): el mes del negocio quedó FIJO, así que la
 * tarjeta ya no ofrece moverlo — solo dice de qué día a qué día va el período.
 * Mover ese día recalcula todo el estado de golpe (ingresos, COGS, nómina y la
 * ventana de los costos fijos cambian de mes a la vez), y es un ajuste de una
 * sola vez, no una perilla del día a día.
 *
 * Para devolver el campo: `CAMBIAR_INICIO_DE_MES_HABILITADO` en
 * @pos-tercos/types. Esa misma constante vuelve a permitir el cambio en el API.
 */
export function MonthCutoffCard({
  monthStartDay,
  periodStart,
  periodEnd,
}: MonthCutoffCardProps) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarRange className="h-4 w-4 text-primary" strokeWidth={1.75} />
        Mes del negocio
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        El estado financiero usa esta ventana, no el mes calendario.
      </p>

      {CAMBIAR_INICIO_DE_MES_HABILITADO ? (
        <MonthCutoffEditor monthStartDay={monthStartDay} />
      ) : null}

      <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Periodo mostrado:{' '}
        <strong className="text-foreground">
          {formatDate(periodStart, 'short')} – {formatDate(periodEnd, 'short')}
        </strong>
      </p>
    </Card>
  );
}
