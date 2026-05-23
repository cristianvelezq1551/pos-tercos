import Link from 'next/link';

// Redes configurables por el dueño. Si no hay URL, no se muestra el link
// (evita enviar al cliente a una página genérica de instagram.com/tiktok.com).
const SOCIAL_LINKS: { label: string; url?: string }[] = [
  { label: 'Instagram', url: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { label: 'TikTok', url: process.env.NEXT_PUBLIC_TIKTOK_URL },
];
const SOCIALS = SOCIAL_LINKS.filter(
  (s): s is { label: string; url: string } => Boolean(s.url),
);

export function WebFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#111111] px-6 py-5 text-sm text-muted-foreground sm:px-12 lg:px-20">
      <p>© {new Date().getFullYear()} TERCOS · Envigado</p>
      {SOCIALS.length > 0 ? (
        <nav className="flex items-center gap-6">
          {SOCIALS.map((s) => (
            <Link
              key={s.label}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium transition-colors hover:text-foreground"
            >
              {s.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </footer>
  );
}
