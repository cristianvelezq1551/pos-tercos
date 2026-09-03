import type { KitchenActivityDay, KitchenActivityUser } from '@pos-tercos/types';
import { DataTable, EmptyState, formatCop, type DataTableColumn } from '@pos-tercos/ui';

/** Suma lo de cada persona a lo largo del rango. Es el dato con el que se
 *  decide: quién produce, quién tira y quién cumple la rutina. */
function aggregate(days: KitchenActivityDay[]): KitchenActivityUser[] {
  const byUser = new Map<string, KitchenActivityUser>();
  for (const day of days) {
    for (const u of day.users) {
      const acc = byUser.get(u.userId);
      if (!acc) {
        byUser.set(u.userId, { ...u });
        continue;
      }
      acc.productionRuns += u.productionRuns;
      acc.producedUnits += u.producedUnits;
      acc.wasteEntries += u.wasteEntries;
      acc.wasteCost += u.wasteCost;
      acc.incidentsLogged += u.incidentsLogged;
      acc.checklistMarks += u.checklistMarks;
    }
  }
  return [...byUser.values()].sort((a, b) => b.productionRuns - a.productionRuns);
}

export function KitchenPeopleTable({ days }: { days: KitchenActivityDay[] }) {
  const people = aggregate(days);

  const columns: DataTableColumn<KitchenActivityUser>[] = [
    {
      key: 'person',
      header: 'Persona',
      primary: true,
      cell: (u) => u.userName ?? 'Sin nombre',
    },
    { key: 'runs', header: 'Tandas', align: 'right', numeric: true, cell: (u) => u.productionRuns || '—' },
    { key: 'units', header: 'Unidades', align: 'right', numeric: true, cell: (u) => u.producedUnits || '—' },
    { key: 'waste', header: 'Mermas', align: 'right', numeric: true, cell: (u) => u.wasteEntries || '—' },
    {
      key: 'wasteCost',
      header: '$ merma',
      align: 'right',
      numeric: true,
      cell: (u) => (u.wasteCost > 0 ? formatCop(u.wasteCost) : '—'),
    },
    {
      key: 'marks',
      header: 'Tareas marcadas',
      align: 'right',
      numeric: true,
      cell: (u) => u.checklistMarks || '—',
    },
    {
      key: 'incidents',
      header: 'Incidencias',
      align: 'right',
      numeric: true,
      cell: (u) => u.incidentsLogged || '—',
    },
  ];

  return (
    <DataTable
      rows={people}
      columns={columns}
      rowKey={(u) => u.userId}
      className="rounded-lg"
      emptyState={
        <EmptyState
          title="Nadie registró actividad"
          description="En este rango no hay producción, merma ni tareas marcadas."
          size="sm"
        />
      }
    />
  );
}
