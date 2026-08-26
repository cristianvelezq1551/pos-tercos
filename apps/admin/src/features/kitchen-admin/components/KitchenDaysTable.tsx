import type { KitchenActivityDay, KitchenRoutineStatus } from '@pos-tercos/types';
import { Badge, formatCop } from '@pos-tercos/ui';
import { Th, Td } from './table-cells';

/** Un día por fila: qué rutinas se cerraron y qué se movió en cocina. */
export function KitchenDaysTable({ days }: { days: KitchenActivityDay[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Día</Th>
            <Th>Apertura</Th>
            <Th>Cierre</Th>
            <Th align="right">Tandas</Th>
            <Th align="right">Mermas</Th>
            <Th align="right">$ merma</Th>
            <Th align="right">Incidencias</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {days.map((d) => (
            <tr key={d.day} className="hover:bg-muted/30">
              <Td>{d.day}</Td>
              <Td>
                <RoutineBadge routine={d.openRoutine} />
              </Td>
              <Td>
                <RoutineBadge routine={d.closeRoutine} />
              </Td>
              <Td mono align="right">
                {d.productionRuns || '—'}
              </Td>
              <Td mono align="right">
                {d.wasteEntries || '—'}
              </Td>
              <Td mono align="right">
                {d.wasteCost > 0 ? (
                  <>
                    {formatCop(d.wasteCost)}
                    {d.wasteCostEstimated > 0 ? (
                      <span className="ml-1 text-[0.6875rem] text-muted-foreground">aprox.</span>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </Td>
              <Td mono align="right">
                {d.incidentsLogged || '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoutineBadge({ routine }: { routine: KitchenRoutineStatus }) {
  if (routine.totalCount === 0) {
    return <span className="text-xs text-ink-300">sin tareas</span>;
  }
  if (routine.completed) return <Badge tone="success">Cerrada</Badge>;
  if (routine.doneCount === 0) return <Badge tone="danger">No se hizo</Badge>;
  return (
    <Badge tone="warning">
      {routine.doneCount}/{routine.totalCount}
    </Badge>
  );
}
