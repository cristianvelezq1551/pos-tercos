import { CatalogGrid, getMenuServer } from '../features/catalog';
import { WebTopbar } from '../components/WebTopbar';
import { EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { WebFooter } from '../components/WebFooter';
import { Hero } from '../components/Hero';
import { CategoryMosaic } from '../components/CategoryMosaic';
import { MobileTabBar } from '../components/MobileTabBar';
import { ActiveOrderBanner } from '../features/checkout';

// Siempre fresco: el menú refleja al instante los cambios del admin.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const menu = await getMenuServer();
  const hasMenu = menu.products.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <WebTopbar transparent />
      <ActiveOrderBanner />
      <main className="flex-1">
        <Hero />
        {hasMenu ? (
          <>
            <CategoryMosaic categories={menu.categories} />
            <CatalogGrid products={menu.products} categories={menu.categories} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-12">
            <EmptyState
              illustration={<LineArtIllustration name="empty-plate" />}
              title="Aún no hay productos disponibles"
              description="Vuelve a probar en un rato. Estamos preparando la carta."
            />
          </div>
        )}
      </main>
      <WebFooter />
      <MobileTabBar />
    </div>
  );
}
