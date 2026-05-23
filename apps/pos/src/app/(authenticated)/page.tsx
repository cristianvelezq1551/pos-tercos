import { redirect } from 'next/navigation';
import { OpsSidebar } from '../../components/OpsSidebar';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
import { CartPanel } from '../../features/sales';
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
      {/*
        Barra de operación (Turnos / Historial en pestañas) — visible desde lg.
        En pantallas chicas se accede por los botones del topbar (mismo
        contenido en modal), así no se pierde funcionalidad.
      */}
      <OpsSidebar />

      {/* Núcleo: catálogo + carrito — siempre visible, ocupa el resto. */}
      <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CatalogGrid products={products} />
        </div>
        <CartPanel />
      </section>
    </div>
  );
}
