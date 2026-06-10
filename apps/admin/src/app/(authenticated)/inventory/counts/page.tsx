import { Container, PageHeader } from '@pos-tercos/ui';
import { ClipboardCheck } from 'lucide-react';
import { CountTasksPanel, RecentCountsTable } from '../../../../features/stock-counts';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type { CountTask, StockCount } from '@pos-tercos/types';

export const dynamic = 'force-dynamic';

async function loadData(): Promise<
  { tasks: CountTask[]; recent: StockCount[] } | { error: string }
> {
  try {
    const [tasks, recent] = await Promise.all([
      serverFetchJson<CountTask[]>('/inventory/count-tasks?limit=5'),
      serverFetchJson<StockCount[]>('/inventory/counts?limit=30'),
    ]);
    return { tasks, recent };
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function InventoryCountsPage() {
  const result = await loadData();

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Conteo físico del día"
        description="Contá estos ítems hoy (rotan solos: nunca contados y más viejos primero). El conteo es ciego: el sistema no te muestra cuánto debería haber. Si difiere, se ajusta el stock y la pérdida aparece en Uso y mermas."
        icon={<ClipboardCheck className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {'error' in result ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar el conteo. {result.error}
          </p>
        ) : (
          <div className="space-y-8">
            <CountTasksPanel tasks={result.tasks} />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Conteos recientes
              </h2>
              <RecentCountsTable counts={result.recent} />
            </section>
          </div>
        )}
      </Container>
    </>
  );
}
