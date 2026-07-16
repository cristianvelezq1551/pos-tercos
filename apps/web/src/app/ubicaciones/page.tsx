import { WebTopbar } from '../../components/WebTopbar';
import { WebFooter } from '../../components/WebFooter';
import { MobileTabBar } from '../../components/MobileTabBar';
import { BusinessHydrator, LocationCard } from '../../features/business';
import { getHeroServer } from '../../features/hero';
import { ActiveOrderBanner } from '../../features/checkout';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ubicaciones · TERCOS',
  description: 'Encuéntranos en Envigado. Pedidos para recoger en tienda.',
};

export default async function UbicacionesPage() {
  const { business } = await getHeroServer();

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <BusinessHydrator business={business} />
      <WebTopbar />
      <ActiveOrderBanner />
      <main className="flex-1">
        <section className="flex flex-col items-center gap-3 px-6 py-12 text-center sm:px-12 sm:py-16 lg:px-20">
          <p className="reveal-up text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Ubicaciones
          </p>
          <h1 className="reveal-up stagger-1 font-display text-5xl font-extrabold leading-tight text-foreground sm:text-6xl">
            Encuéntranos
          </h1>
        </section>
        <section className="px-6 pb-12 sm:px-12 lg:px-20">
          <LocationCard />
        </section>
      </main>
      <WebFooter />
      <MobileTabBar />
    </div>
  );
}
