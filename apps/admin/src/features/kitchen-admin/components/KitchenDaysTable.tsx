import type { KitchenActivityDay, KitchenRoutineStatus } from '@pos-tercos/types';
import {
  Badge,
  DataTable,
  EmptyState,
  formatCop,
  formatDate,
  type DataTableColumn,
} from '@pos-tercos/ui';

/** Un día por fila: qué rutinas se cerraron y qué se movió en cocina. */
export function KitchenDaysTable({ days }: { days: KitchenActivityDay[] }) {
  const columns: DataTableColumn<KitchenActivityDay>[] = [
    {
      key: 'day',
      header: 'Día',
      primary: true,
      cell: (d) => (
        <time dateTime={d.day} className="whitespace-nowrap font-medium text-foreground">
          {formatDate(d.day, 'short')}
        </time>
      ),
    },
    {
      key: 'open',
      header: 'Apertura',
      cell: (d) => <RoutineBadge routine={d.openRoutine} />,
    },
    {
      key: 'close',
      header: 'Cierre',
      cell: (d) => <RoutineBadge routine={d.closeRoutine} />,
    },
    {
      key: 'runs',
      header: 'Tandas',
      align: 'right',
      numeric: true,
      cell: (d) => d.productionRuns || '—',
    },
    {
      key: 'wasteCount',
      header: 'Mermas',
      align: 'right',
      numeric: true,
      cell: (d) => d.wasteEntries || '—',
    },
    {
      key: 'wasteCost',
      header: '$ merma',
      align: 'right',
      numeric: true,
      cell: (d) =>
        d.wasteCost > 0 ? (
          <>
            {formatCop(d.wasteCost)}
            {d.wasteCostEstimated > 0 ? (
              <span className="ml-1 text-[0.6875rem] text-muted-foreground">aprox.</span>
            ) : null}
          </>
        ) : (
          '—'
        ),
    },
    {
      key: 'incidents',
      header: 'Incidencias',
      align: 'right',
      numeric: true,
      cell: (d) => d.incidentsLogged || '—',
    },
  ];

  return (
    <DataTable
      rows={days}
      columns={columns}
      rowKey={(d) => d.day}
      className="rounded-lg"
      emptyState={
        <EmptyState
          title="Sin actividad"
          description="No hay días con movimiento en este rango."
          size="sm"
        />
      }
    />
  );
}

function RoutineBadge({ routine }: { routine: KitchenRoutineStatus }) {
  if (routine.totalCount === 0) {
    return <span className="text-xs text-muted-foreground">sin tareas</span>;
  }
  if (routine.completed) return <Badge tone="success">Cerrada</Badge>;
  if (routine.doneCount === 0) return <Badge tone="danger">No se hizo</Badge>;
  return (
    <Badge tone="warning">
      {routine.doneCount}/{routine.totalCount}
    </Badge>
  );
}
