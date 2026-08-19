import { redirect } from 'next/navigation';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
import { CartPanel, OrdersPanel } from '../../features/sales';
import { StaleShiftGate } from '../../features/caja-shifts';
import { getCurrentShiftStatusServer } from '../../features/caja-shifts/server';

export const dynamic = 'force-dynamic';

export default async function CajaVenderPage() {
  const { shift, stalePreviousDay } = await getCurrentShiftStatusServer();
  if (!shift) {
    redirect('/caja/shift/open');
  }
  if (stalePreviousDay) {
    return <StaleShiftGate shift={shift} />;
  }
  const products = await getActiveProductsServer();
  return (
    <div className="flex h-full min-h-0">
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
