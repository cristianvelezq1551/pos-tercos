import { Clock, Map, MapPin, Phone } from 'lucide-react';
import { WebTopbar } from '../../components/WebTopbar';
import { WebFooter } from '../../components/WebFooter';
import { MobileTabBar } from '../../components/MobileTabBar';
import { ActiveOrderBanner } from '../../features/checkout';

export const metadata = {
  title: 'Ubicaciones · TERCOS',
  description: 'Encuéntranos en Envigado. Pedidos para recoger en tienda.',
};

interface Location {
  name: string;
  address: string;
  phone: string;
  hours: string;
}

const LOCATIONS: Location[] = [
  {
    name: 'TERCOS Envigado',
    address: 'Cra 31 #37s-49, Envigado, Antioquia',
    phone: '+57 304 670 6847',
    hours: 'Lun–Dom: 17:00 – 23:00',
  },
];

export default function UbicacionesPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <WebTopbar />
      <ActiveOrderBanner />
      <main className="flex-1">
        <PageHeader />
        <CardsRow />
      </main>
      <WebFooter />
      <MobileTabBar />
    </div>
  );
}

function PageHeader() {
  return (
    <section className="flex flex-col items-center gap-3 px-6 py-12 text-center sm:px-12 sm:py-16 lg:px-20">
      <p className="reveal-up text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Ubicaciones
      </p>
      <h1 className="reveal-up stagger-1 font-display text-5xl font-extrabold leading-tight text-foreground sm:text-6xl">
        Encuéntranos
      </h1>
    </section>
  );
}

function CardsRow() {
  return (
    <section className="grid grid-cols-1 gap-6 px-6 pb-12 sm:px-12 lg:grid-cols-1 lg:px-20">
      {LOCATIONS.map((loc, idx) => (
        <LocationCard key={loc.name} location={loc} index={idx} />
      ))}
    </section>
  );
}

function LocationCard({ location, index }: { location: Location; index: number }) {
  const initial = location.name.replace('TERCOS ', '').charAt(0).toUpperCase();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    location.address,
  )}`;

  return (
    <article
      style={{ animationDelay: `${100 + index * 140}ms` }}
      className="reveal-up card-lift overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="relative flex h-60 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(220,38,38,0.18),transparent_55%)]"
        />
        <span
          aria-hidden
          className="font-display text-9xl font-extrabold uppercase tracking-[0.04em] text-white/[0.08]"
        >
          {initial}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <h2 className="text-xl font-extrabold tracking-[0.02em] text-foreground sm:text-2xl">
          {location.name}
        </h2>

        <ul className="flex flex-col gap-2.5">
          <DetailRow icon={<MapPin className="h-4 w-4" strokeWidth={2} />}>
            {location.address}
          </DetailRow>
          <DetailRow icon={<Phone className="h-4 w-4" strokeWidth={2} />}>
            <a
              href={`tel:${location.phone.replace(/\s+/g, '')}`}
              className="transition-colors hover:text-foreground"
            >
              {location.phone}
            </a>
          </DetailRow>
          <DetailRow icon={<Clock className="h-4 w-4" strokeWidth={2} />}>
            {location.hours}
          </DetailRow>
        </ul>

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ver ubicación de ${location.name} en Google Maps`}
          className="flex h-28 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-ink-700 hover:text-foreground"
        >
          <Map className="h-7 w-7" strokeWidth={1.5} />
        </a>

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="press inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-red-700 active:bg-red-800"
        >
          Cómo llegar
        </a>
      </div>
    </article>
  );
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

