'use client';

import type { WeeklyPayrollReport } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { EmployeeWeekCard } from './EmployeeWeekCard';

/**
 * Lista de empleados DIARIO de la semana. Cada card permite seleccionar días y
 * registrar un abono parcial o total con comprobante.
 */
export function WeeklyPayrollView({ report }: { report: WeeklyPayrollReport }) {
  if (report.entries.length === 0) {
    return (
      <EmptyState
        title="Sin empleados diarios"
        description="No hay empleados con pago DIARIO activos esta semana. Configura el tipo de pago en Usuarios."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {report.entries.map((entry) => (
        <EmployeeWeekCard key={entry.userId} entry={entry} weekStart={report.weekStart} />
      ))}
    </div>
  );
}
