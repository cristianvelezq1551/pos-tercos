import { CatalogGrid, getMenuServer } from '../features/catalog';
import { WebTopbar } from '../components/WebTopbar';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const menu = await getMenuServer();
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <WebTopbar />
      {menu.products.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-gray-500">
          No hay productos disponibles. Volvé a probar en un rato.
        </div>
      ) : (
        <main className="flex-1">
          <CatalogGrid products={menu.products} categories={menu.categories} />
        </main>
      )}
    </div>
  );
}
