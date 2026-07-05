import { ChecklistItemsPanel, IncidentsPanel } from '../../../features/kitchen-admin';

export const dynamic = 'force-dynamic';

export default function CocinaAdminPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Cocina</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Incidencias que reporta el cocinero y las tareas del checklist de apertura/cierre.
        </p>
      </div>
      <IncidentsPanel />
      <ChecklistItemsPanel />
    </div>
  );
}
