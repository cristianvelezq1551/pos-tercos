'use client';

import { Button, Card, FormField, Input, formatDate } from '@pos-tercos/ui';
import { CalendarRange } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateBusinessConfig } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface MonthCutoffCardProps {
  /** Día de corte actual (1–28). */
  monthStartDay: number;
  /** Ventana vigente del mes mostrado (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
}

/**
 * Configura el día en que arranca el "mes del negocio". Cambiarlo recalcula el
 * estado financiero (ingresos, COGS y nómina caen dentro de la ventana). Los
 * costos fijos mensuales cuentan una vez por mes, sin prorratear.
 */
export function MonthCutoffCard({ monthStartDay, periodStart, periodEnd }: MonthCutoffCardProps) {
  const router = useRouter();
  const [day, setDay] = useState(String(monthStartDay));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const parsed = Number(day);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 28;
  const dirty = parsed !== monthStartDay;

  const save = async (): Promise<void> => {
    if (!valid || !dirty) return;
    setError(null);
    setOk(false);
    setPending(true);
    try {
      await updateBusinessConfig({ monthStartDay: parsed });
      setOk(true);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarRange className="h-4 w-4 text-primary" strokeWidth={1.75} />
        Mes del negocio
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        El estado financiero usa esta ventana, no el mes calendario.
      </p>

      <div className="mt-3 flex items-end gap-3">
        <FormField
          label="Empieza el día"
          hint="1–28 (1 = mes calendario)"
          error={day !== '' && !valid ? 'Día inválido' : undefined}
        >
          <Input
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={pending}
            className="w-24"
          />
        </FormField>
        <Button onClick={save} disabled={pending || !valid || !dirty}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Periodo mostrado:{' '}
        <strong className="text-foreground">
          {formatDate(periodStart, 'short')} – {formatDate(periodEnd, 'short')}
        </strong>
      </p>

      {error ? (
        <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {ok && !dirty ? (
        <p className="mt-2 text-xs text-success">Guardado. Recalculando…</p>
      ) : null}
    </Card>
  );
}
