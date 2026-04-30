import { redirect } from 'next/navigation';
import { CatalogGrid } from '../../features/catalog';
import { getActiveProductsServer } from '../../features/catalog/server';
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
      <aside className="hidden flex-col bg-white lg:flex">
        <header className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">Carrito</h2>
          <p className="mt-0.5 text-xs text-gray-500">5.E.4 — todavía no operativo</p>
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-gray-400">
          El carrito se cablea en el próximo bloque.
        </div>
      </aside>
    </div>
  );
}
