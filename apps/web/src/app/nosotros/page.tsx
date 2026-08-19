import { Flame, Heart, Leaf, type LucideIcon } from 'lucide-react';
import type { BusinessAbout } from '@pos-tercos/types';
import { WebTopbar } from '../../components/WebTopbar';
import { WebFooter } from '../../components/WebFooter';
import { MobileTabBar } from '../../components/MobileTabBar';
import { BusinessHydrator } from '../../features/business';
import { getHeroServer } from '../../features/hero';
import { ActiveOrderBanner } from '../../features/checkout';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nosotros · TERCOS',
  description: 'La historia detrás de TERCOS: fuego real, ingredientes frescos y mucha actitud.',
};

export default async function NosotrosPage() {
  const { business } = await getHeroServer();
  const { about } = business;

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <BusinessHydrator business={business} />
      <WebTopbar />
      <ActiveOrderBanner />
      <main className="flex-1">
        <HeroAbout about={about} />
        {about.values.length > 0 ? <ValuesSection values={about.values} /> : null}
      </main>
      <WebFooter />
      <MobileTabBar />
    </div>
  );
}

function HeroAbout({ about }: { about: BusinessAbout }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]" style={{ minHeight: 500 }}>
      <AboutImage imageUrl={about.imageUrl} />
      <div className="flex flex-col justify-center gap-5 bg-[#111111] px-6 py-12 sm:px-12 lg:px-16">
        <p className="reveal-up text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Nuestra historia
        </p>
        <h1 className="reveal-up stagger-1 font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
          {about.headline || 'Nacimos tercos.'}
        </h1>
        {about.story ? (
          <p className="reveal-up stagger-2 max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
            {about.story}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Con foto se ve la foto; sin foto, el degradado de siempre (nunca un hueco). */
function AboutImage({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <div className="relative overflow-hidden bg-muted lg:min-h-[500px]" style={{ minHeight: 320 }}>
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="relative overflow-hidden bg-gradient-to-br from-muted via-card to-background lg:min-h-[500px]"
      style={{ minHeight: 320 }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(220,38,38,0.18),transparent_55%)]"
      />
      <Flame aria-hidden className="absolute right-12 top-12 h-24 w-24 text-primary/20" strokeWidth={1.5} />
      <span
        aria-hidden
        className="absolute -bottom-6 -left-6 select-none font-display text-[14rem] font-extrabold uppercase leading-none tracking-[0.04em] text-white/[0.04]"
      >
        T
      </span>
    </div>
  );
}

/**
 * Los íconos son POSICIONALES: el dueño edita título y texto, la web pone el
 * ícono según el orden. Si agrega más valores que íconos, la lista se recicla.
 */
const VALUE_ICONS: LucideIcon[] = [Flame, Leaf, Heart];

function ValuesSection({ values }: { values: BusinessAbout['values'] }) {
  return (
    <section className="border-t border-border px-6 py-16 sm:px-12 lg:px-20">
      <p className="mb-10 text-center text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Nuestros valores
      </p>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3">
        {values.map((value, idx) => {
          const Icon = VALUE_ICONS[idx % VALUE_ICONS.length]!;
          return (
            <article
              key={`${value.title}-${idx}`}
              style={{ animationDelay: `${100 + idx * 100}ms` }}
              className="reveal-up flex flex-col items-center gap-3 text-center"
            >
              <Icon className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <h3 className="text-lg font-bold text-foreground">{value.title}</h3>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                {value.description}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
