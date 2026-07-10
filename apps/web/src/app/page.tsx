import { CatalogGrid, getMenuServer } from '../features/catalog';
import { PromotionsHydrator } from '../features/promotions';
import { WebTopbar } from '../components/WebTopbar';
import { EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { WebFooter } from '../components/WebFooter';
import { Hero } from '../components/Hero';
import { HeroCarousel, getHeroServer } from '../features/hero';
import { MobileTabBar } from '../components/MobileTabBar';
import { ActiveOrderBanner } from '../features/checkout';

// Siempre fresco: el menú y la publicidad reflejan al instante los cambios del admin.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [menu, hero] = await Promise.all([getMenuServer(), getHeroServer()]);
  const hasMenu = menu.products.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <PromotionsHydrator promotions={menu.promotions} />
      <WebTopbar transparent />
      <ActiveOrderBanner />
      <main className="flex-1">
        {hero.slides.length > 0 ? <HeroCarousel slides={hero.slides} /> : <Hero />}
        {!menu.webOrdersEnabled ? (
          <div className="mx-auto mt-6 max-w-2xl px-6">
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900">
              Los pedidos online están temporalmente pausados. ¡Te esperamos en el local!
            </p>
          </div>
        ) : null}
        {hasMenu ? (
          <CatalogGrid products={menu.products} categories={menu.categories} />
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
