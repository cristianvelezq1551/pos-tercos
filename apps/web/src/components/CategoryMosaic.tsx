import Link from 'next/link';

export function CategoryMosaic({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;
  const tiles = categories.slice(0, 4);

  return (
    <section className="bg-[#111111] px-6 py-10 sm:px-12 lg:px-20">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-[0.18em] text-foreground">
            Nuestro menú
          </h2>
          <p className="text-sm text-muted-foreground">
            Lo que más piden nuestros clientes
          </p>
        </div>
        <Link
          href="#menu"
          className="text-sm font-semibold text-primary transition-colors hover:text-red-500"
        >
          Ver todo →
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((category, idx) => (
          <CategoryTile key={category} label={category} accent={idx} index={idx} />
        ))}
      </div>
    </section>
  );
}

const ACCENTS = [
  'from-red-700/60 via-black/40 to-black',
  'from-amber-700/40 via-black/40 to-black',
  'from-orange-700/40 via-black/40 to-black',
  'from-yellow-700/30 via-black/40 to-black',
] as const;

function CategoryTile({
  label,
  accent,
  index,
}: {
  label: string;
  accent: number;
  index: number;
}) {
  const delay = `${100 + index * 80}ms`;
  return (
    <Link
      href="#menu"
      style={{ animationDelay: delay }}
      className="reveal-up card-lift group relative flex h-44 items-end overflow-hidden rounded-xl bg-card"
    >
      <div
        aria-hidden
        className={`absolute inset-0 bg-gradient-to-tr ${ACCENTS[accent % ACCENTS.length]} transition-transform duration-500 group-hover:scale-105`}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none font-display text-7xl font-extrabold uppercase tracking-[0.04em] text-white/[0.06] transition-all duration-500 group-hover:text-white/[0.12]"
      >
        {label.charAt(0)}
      </span>
      <span className="relative z-10 px-4 pb-4 font-display text-lg font-bold uppercase tracking-wide text-foreground transition-transform duration-300 group-hover:translate-x-1">
        {label}
      </span>
    </Link>
  );
}
