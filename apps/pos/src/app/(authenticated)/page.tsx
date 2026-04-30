import { redirect } from 'next/navigation';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
import { CartPanel } from '../../features/sales';
import { getCurrentShiftServer } from '../../features/shifts/server';

export default async function PosHomePage() {
  const shift = await getCurrentShiftServer();
  if (!shift) {
    redirect('/shift/open');
  }
  const products = await getActiveProductsServer();
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
      <section className="flex flex-col overflow-hidden border-r border-gray-200">
        <CatalogGrid products={products} />
      </section>
      <CartPanel />
    </div>
  );
}
