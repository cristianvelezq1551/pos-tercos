import type { KitchenActivityDay } from '@pos-tercos/types';
import {
  getChecklistHistory,
  getKitchenActivity,
  getKitchenProductions,
  getKitchenWaste,
  type KitchenQuery,
  type Loaded,
} from '../server';
import { ChecklistHistoryPanel } from './ChecklistHistoryPanel';
import { ChecklistItemsPanel } from './ChecklistItemsPanel';
import { IncidentsPanel } from './IncidentsPanel';
import { KitchenSummaryPanel } from './KitchenSummaryPanel';
import type { KitchenTab } from './KitchenTabs';
import { ProductionsTable } from './ProductionsTable';
import { WasteTable } from './WasteTable';
import { WorkerFilter, type WorkerOption } from './WorkerFilter';

/** Quiénes trabajaron en el rango. Sale del resumen, que NO se filtra por
 *  persona — así el selector no se queda con una sola opción al filtrar. */
function workerOptions(activity: Loaded<KitchenActivityDay[]>): WorkerOption[] {
  if ('error' in activity) return [];
  const byId = new Map<string, WorkerOption>();
  for (const day of activity.data) {
    for (const u of day.users) {
      if (!byId.has(u.userId)) byId.set(u.userId, { userId: u.userId, userName: u.userName });
    }
  }
  return [...byId.values()].sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? ''));
}

function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      No se pudo cargar. {message}
    </p>
  );
}

export async function KitchenTabContent({ tab, query }: { tab: KitchenTab; query: KitchenQuery }) {
  if (tab === 'tareas') return <ChecklistItemsPanel />;
  if (tab === 'incidencias') return <IncidentsPanel />;

  if (tab === 'checklist') {
    const result = await getChecklistHistory(query);
    return 'error' in result ? (
      <LoadError message={result.error} />
    ) : (
      <ChecklistHistoryPanel days={result.data} />
    );
  }

  if (tab === 'resumen') {
    const result = await getKitchenActivity(query);
    return 'error' in result ? (
      <LoadError message={result.error} />
    ) : (
      <KitchenSummaryPanel days={result.data} />
    );
  }

  // Producción y merma comparten el filtro por persona; el resumen va aparte
  // porque es de donde salen las opciones (sin filtrar).
  const activity = getKitchenActivity({ from: query.from, to: query.to });

  if (tab === 'produccion') {
    const [runs, workers] = await Promise.all([getKitchenProductions(query), activity]);
    return (
      <div className="space-y-4">
        <WorkerFilter options={workerOptions(workers)} />
        {'error' in runs ? <LoadError message={runs.error} /> : <ProductionsTable runs={runs.data} />}
      </div>
    );
  }

  const [waste, workers] = await Promise.all([getKitchenWaste(query), activity]);
  return (
    <div className="space-y-4">
      <WorkerFilter options={workerOptions(workers)} />
      {'error' in waste ? <LoadError message={waste.error} /> : <WasteTable entries={waste.data} />}
    </div>
  );
}
