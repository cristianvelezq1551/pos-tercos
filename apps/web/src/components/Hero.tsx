import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="relative -mt-16 flex h-[min(720px,90vh)] w-full items-center overflow-hidden"
    >
      <img
        src="/hero.gif"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full select-none object-cover"
        draggable={false}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(220,38,38,0.25),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-background"
      />

      <span
        aria-hidden
        className="reveal-fade pointer-events-none absolute right-[-2rem] top-1/2 hidden -translate-y-1/2 -rotate-[5deg] select-none font-display text-[18rem] font-extrabold uppercase leading-none tracking-[0.06em] text-white/[0.05] sm:block"
        style={{ animationDelay: '400ms', animationDuration: '1200ms' }}
      >
        Tercos
      </span>

      <div className="relative z-10 flex w-full flex-col gap-7 px-6 sm:px-12 lg:px-20">
        <div className="flex flex-col gap-2">
          <h1 className="reveal-up font-display text-[clamp(3rem,9vw,6rem)] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-foreground">
            Hambre con
          </h1>
          <h1 className="reveal-up stagger-1 font-display text-[clamp(3rem,9vw,6rem)] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-primary">
            Carácter.
          </h1>
        </div>

        <p className="reveal-up stagger-2 max-w-md text-base leading-relaxed text-muted-foreground">
          Pídelo en linea. Recógelo en tienda o lo enviamos a domicilio.
          Hamburguesas, burritos y más.
        </p>

        <div className="reveal-up stagger-3 w-full sm:w-auto">
          <Link
            href="#menu"
            className="press pulse-glow inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-red-700 hover:shadow-primary/30 active:bg-red-800 sm:w-auto sm:rounded-full"
          >
            Ver menú
          </Link>
        </div>
      </div>

      <Link
        href="#menu"
        aria-label="Ver el menú"
        className="floaty absolute bottom-6 left-1/2 z-10 inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
      >
        <ChevronDown className="h-5 w-5" />
      </Link>
    </section>
  );
}
