import { redirect } from 'next/navigation';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
import { CartPanel, DayHistoryPanel } from '../../features/sales';
import { getCurrentShiftServer } from '../../features/shifts/server';
import { TurnPanel } from '../../features/turn';

export default async function PosHomePage() {
  const shift = await getCurrentShiftServer();
  if (!shift) {
    redirect('/shift/open');
  }
  const products = await getActiveProductsServer();
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr_360px]">
      {/* Columna izquierda: gestor de turnos (arriba) + historial (abajo). */}
      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-hidden border-r border-border bg-muted/20 p-3">
        <section className="shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm">
          <h2 className="caps mb-2.5 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            Turnos
          </h2>
          <TurnPanel />
        </section>
        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
          <h2 className="caps mb-2.5 shrink-0 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            Historial del día
          </h2>
          <DayHistoryPanel />
        </section>
      </aside>

      {/* Centro: catálogo de productos (como estaba). */}
      <section className="flex flex-col overflow-hidden border-r border-border">
        <CatalogGrid products={products} />
      </section>

      {/* Derecha: carrito (como estaba). */}
      <CartPanel />
    </div>
  );
}
