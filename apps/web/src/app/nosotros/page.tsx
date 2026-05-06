import { Flame, Heart, Leaf, type LucideIcon } from 'lucide-react';
import { WebTopbar } from '../../components/WebTopbar';
import { WebFooter } from '../../components/WebFooter';
import { MobileTabBar } from '../../components/MobileTabBar';
import { ActiveOrderBanner } from '../../features/checkout';

export const metadata = {
  title: 'Nosotros · TERCOS',
  description: 'La historia detrás de TERCOS: fuego real, ingredientes frescos y mucha actitud.',
};

export default function NosotrosPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-24 text-foreground md:pb-0">
      <WebTopbar />
      <ActiveOrderBanner />
      <main className="flex-1">
        <HeroAbout />
        <ValuesSection />
        <TeamSection />
      </main>
      <WebFooter />
      <MobileTabBar />
    </div>
  );
}

function HeroAbout() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]" style={{ minHeight: 500 }}>
      <div
        aria-hidden
        className="relative overflow-hidden bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 lg:min-h-[500px]"
        style={{ minHeight: 320 }}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(220,38,38,0.18),transparent_55%)]"
        />
        <Flame
          aria-hidden
          className="absolute right-12 top-12 h-24 w-24 text-primary/20"
          strokeWidth={1.5}
        />
        <span
          aria-hidden
          className="absolute -bottom-6 -left-6 select-none font-display text-[14rem] font-extrabold uppercase leading-none tracking-[0.04em] text-white/[0.04]"
        >
          T
        </span>
      </div>
      <div className="flex flex-col justify-center gap-5 bg-[#111111] px-6 py-12 sm:px-12 lg:px-16">
        <p className="reveal-up text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Nuestra historia
        </p>
        <h1 className="reveal-up stagger-1 font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
          Nacimos tercos.
        </h1>
        <p className="reveal-up stagger-2 max-w-prose text-base leading-relaxed text-muted-foreground">
         En 2026 nació Tercos con una idea clara: traer una propuesta diferente a la ciudad y salirnos de lo tradicional.
        Desde el principio decidimos hacer las cosas a nuestra manera, creando sabores y combinaciones que se sienten nuevas, auténticas y con personalidad propia.

        Cada plato que sale de nuestra cocina está hecho con ingredientes frescos, fuego real y la terquedad de no conformarnos con lo común.
        </p>
      </div>
    </section>
  );
}

const VALUES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Flame,
    title: 'Fuego Real',
    description: 'Creamos combinaciones intensas y diferentes que hacen que cada plato se salga de lo común.',
  },
  {
    icon: Leaf,
    title: 'Ingredientes Frescos',
    description: 'Trabajamos con ingredientes frescos y selección local para que cada bocado tenga calidad de verdad.',
  },
  {
    icon: Heart,
    title: 'Hecho con Actitud',
    description: 'Cada plato refleja nuestra esencia: hacer comida auténtica, diferente y con personalidad propia.',
  },
];

function ValuesSection() {
  return (
    <section className="border-t border-border px-6 py-16 sm:px-12 lg:px-20">
      <p className="mb-10 text-center text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Nuestros valores
      </p>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3">
        {VALUES.map(({ icon: Icon, title, description }, idx) => (
          <article
            key={title}
            style={{ animationDelay: `${100 + idx * 100}ms` }}
            className="reveal-up flex flex-col items-center gap-3 text-center"
          >
            <Icon className="h-8 w-8 text-primary" strokeWidth={1.75} />
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

const TEAM: { name: string; role: string }[] = [
  { name: 'Pablo Restrepo', role: 'Marketing & Fundador' },
  { name: 'Andrés Gutiérrez', role: 'Jefe de Cocina' },
];

function TeamSection() {
  return (
    <section className="border-t border-border px-6 py-16 sm:px-12 lg:px-20">
      <header className="mb-10 flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          El equipo
        </p>
        <h2 className="font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          Los tercos del sabor.
        </h2>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {TEAM.map((member, idx) => (
          <TeamCard
            key={member.name}
            name={member.name}
            role={member.role}
            index={idx}
          />
        ))}
      </div>
    </section>
  );
}

function TeamCard({
  name,
  role,
  index,
}: {
  name: string;
  role: string;
  index: number;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <article
      style={{ animationDelay: `${100 + index * 120}ms` }}
      className="reveal-up card-lift overflow-hidden rounded-2xl bg-card"
    >
      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.12),transparent_55%)]"
        />
        <span className="font-display text-7xl font-extrabold uppercase tracking-[0.04em] text-white/10">
          {initials || 'T'}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-5">
        <h3 className="text-lg font-bold leading-tight text-foreground">{name}</h3>
        <p className="text-sm text-muted-foreground">{role}</p>
      </div>
    </article>
  );
}
