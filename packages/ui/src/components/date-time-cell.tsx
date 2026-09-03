import * as React from 'react';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/format';

export interface DateTimeCellProps {
  value: Date | string | null | undefined;
  className?: string;
}

/**
 * Fecha y hora de una fila. En pantalla ancha va completa ("02 de sept de
 * 2026, 16:05"); en teléfono, sin el año ("02 sept, 16:05").
 *
 * El motivo es concreto: dentro de una tarjeta, al lado de su etiqueta, la
 * versión larga se parte en dos o tres líneas y una lista de veinte filas se
 * vuelve ilegible. El año lo da el contexto de la pantalla — el rango de
 * fechas que la persona acaba de elegir.
 */
export function DateTimeCell({ value, className }: DateTimeCellProps) {
  const iso = value instanceof Date ? value.toISOString() : (value ?? undefined);
  return (
    <time
      dateTime={iso}
      className={cn('tabular whitespace-nowrap text-xs text-muted-foreground', className)}
    >
      <span className="sm:hidden">{formatDate(value, 'datetime-compact')}</span>
      <span className="hidden sm:inline">{formatDate(value, 'datetime')}</span>
    </time>
  );
}
DateTimeCell.displayName = 'DateTimeCell';
