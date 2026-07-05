import { redirect } from 'next/navigation';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
import { CartPanel, OrdersPanel } from '../../features/sales';
import { StaleShiftGate } from '../../features/shifts';
import { getCurrentShiftStatusServer } from '../../features/shifts/server';

export default async function PosHomePage() {
  const { shift, stalePreviousDay } = await getCurrentShiftStatusServer();
  if (!shift) {
    redirect('/shift/open');
  }
  // Caja que quedó abierta de un día anterior: bloquear venta hasta cerrarla.
  if (stalePreviousDay) {
    return <StaleShiftGate shift={shift} />;
  }
  const products = await getActiveProductsServer();
  return (
    <div className="flex h-full min-h-0">
      {/* Núcleo: pedidos (#2, cuentas abiertas + últimos del día) + catálogo +
          carrito. Turnos/Historial/Caja viven en sus pestañas de la nav
          superior (la campana de "listo" es global, suena en cualquier pestaña). */}
      <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <OrdersPanel />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CatalogGrid products={products} />
        </div>
        <CartPanel />
      </section>
    </div>
  );
}
