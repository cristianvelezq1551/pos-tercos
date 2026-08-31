'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Shift } from '@pos-tercos/types';
import { shiftLabel } from '../lib/shift-label';

interface SalesScopeFilterProps {
  /** Cajas abiertas dentro del rango de fechas elegido arriba. */
  shifts: Shift[];
  selectedShiftId?: string;
  /** Caja elegida que quedó fuera del rango: se ofrece igual para no perderla. */
  outOfRangeShift?: Shift;
}

/**
 * Alcance del listado detallado: el rango de fechas de arriba (atribución
 * contable, día calendario) o UNA caja/arqueo (la sesión real, que puede
 * extenderse hasta la madrugada).
 */
export function SalesScopeFilter({
  shifts,
  selectedShiftId,
  outOfRangeShift,
}: SalesScopeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set('shift', value);
    else next.delete('shift');
    router.push(`?${next.toString()}`);
  };

  return (
    <label className="flex w-full min-w-0 items-center gap-2 text-xs sm:w-auto">
      <span className="text-muted-foreground">Ver:</span>
      <select
        value={selectedShiftId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-base text-foreground sm:flex-none sm:text-xs"
      >
        <option value="">Por fecha (rango de arriba)</option>
        {outOfRangeShift && (
          <optgroup label="Selección actual (fuera del rango)">
            <option value={outOfRangeShift.id}>{shiftLabel(outOfRangeShift)}</option>
          </optgroup>
        )}
        {shifts.length > 0 && (
          <optgroup label="Por arqueo (caja)">
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {shifts.length === 0 && !outOfRangeShift && (
        <span className="text-muted-foreground">(sin cajas en el rango)</span>
      )}
    </label>
  );
}
