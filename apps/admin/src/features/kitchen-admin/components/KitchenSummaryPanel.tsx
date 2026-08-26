import type { KitchenActivityDay } from '@pos-tercos/types';
import { EmptyState, StatCard, formatCop } from '@pos-tercos/ui';
import { KitchenDaysTable } from './KitchenDaysTable';
import { KitchenPeopleTable } from './KitchenPeopleTable';

/** Resumen del rango: totales, día por día y quién hizo qué. */
export function KitchenSummaryPanel({ days }: { days: KitchenActivityDay[] }) {
  if (days.length === 0) {
    return <EmptyState title="Sin datos" description="No hay actividad en este rango." size="sm" />;
  }

  const runs = days.reduce((s, d) => s + d.productionRuns, 0);
  const wasteCost = days.reduce((s, d) => s + d.wasteCost, 0);
  const estimated = days.reduce((s, d) => s + d.wasteCostEstimated, 0);
  const incidents = days.reduce((s, d) => s + d.incidentsLogged, 0);
  // Un día cuenta como rutina pendiente si TENÍA tareas y no se cerró: un día
  // sin tareas configuradas no es un incumplimiento de nadie.
  const pendientes = days.filter(
    (d) =>
      (d.openRoutine.totalCount > 0 && !d.openRoutine.completed) ||
      (d.closeRoutine.totalCount > 0 && !d.closeRoutine.completed),
  ).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tandas producidas" value={runs} tone="primary" />
        <StatCard
          label="Merma"
          value={formatCop(wasteCost)}
          tone={wasteCost > 0 ? 'warning' : 'neutral'}
          hint={estimated > 0 ? `Incluye ${formatCop(estimated)} estimados` : undefined}
        />
        <StatCard label="Incidencias" value={incidents} tone={incidents > 0 ? 'warning' : 'neutral'} />
        <StatCard
          label="Días con rutina sin cerrar"
          value={pendientes}
          tone={pendientes > 0 ? 'danger' : 'success'}
          hint={`de ${days.length} días`}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Día por día
        </h2>
        <KitchenDaysTable days={days} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Por persona
        </h2>
        <KitchenPeopleTable days={days} />
      </section>
    </div>
  );
}
