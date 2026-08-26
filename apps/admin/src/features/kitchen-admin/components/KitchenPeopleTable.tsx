import type { KitchenActivityDay, KitchenActivityUser } from '@pos-tercos/types';
import { EmptyState, formatCop } from '@pos-tercos/ui';
import { Th, Td } from './table-cells';

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
  if (people.length === 0) {
    return (
      <EmptyState
        title="Nadie registró actividad"
        description="En este rango no hay producción, merma ni tareas marcadas."
        size="sm"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Persona</Th>
            <Th align="right">Tandas</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Mermas</Th>
            <Th align="right">$ merma</Th>
            <Th align="right">Tareas marcadas</Th>
            <Th align="right">Incidencias</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {people.map((u) => (
            <tr key={u.userId} className="hover:bg-muted/30">
              <Td>{u.userName ?? 'Sin nombre'}</Td>
              <Td mono align="right">{u.productionRuns || '—'}</Td>
              <Td mono align="right">{u.producedUnits || '—'}</Td>
              <Td mono align="right">{u.wasteEntries || '—'}</Td>
              <Td mono align="right">{u.wasteCost > 0 ? formatCop(u.wasteCost) : '—'}</Td>
              <Td mono align="right">{u.checklistMarks || '—'}</Td>
              <Td mono align="right">{u.incidentsLogged || '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
