import { CatalogGrid, getMenuServer } from '../features/catalog';
import { BusinessHydrator, StatusBanner } from '../features/business';
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
      <BusinessHydrator business={hero.business} />
      <WebTopbar transparent />
      <ActiveOrderBanner />
      <main className="flex-1">
        {hero.slides.length > 0 ? <HeroCarousel slides={hero.slides} /> : <Hero />}
        {/* Cubre los dos motivos por los que no se puede pedir: kill-switch (#13)
            y fuera de horario. Reemplaza al banner que solo miraba el switch. */}
        <StatusBanner />
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
