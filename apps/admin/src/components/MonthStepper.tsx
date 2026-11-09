'use client';

import { Button } from '@pos-tercos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../lib/dates';

/**
 * Flechas + nombre del mes. Controlado: quien lo usa decide qué hace al
 * cambiar (el estado financiero navega por URL; costos y gastos filtra en el
 * cliente, que ya tiene el catálogo entero).
 */
export function MonthStepper({
  year,
  month,
  onChange,
}: {
  year: number;
  /** 1-12 */
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(shiftMonth(year, month, -1))}
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-44 text-center font-display text-base font-bold capitalize text-foreground">
        {monthLabel(year, month)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(shiftMonth(year, month, 1))}
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
