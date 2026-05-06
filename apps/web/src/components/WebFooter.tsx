import Link from 'next/link';

export function WebFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[#111111] px-6 py-5 text-sm text-muted-foreground sm:px-12 lg:px-20">
      <p>© {new Date().getFullYear()} TERCOS · Envigado</p>
      <nav className="flex items-center gap-6">
        <Link
          href="https://instagram.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium transition-colors hover:text-foreground"
        >
          Instagram
        </Link>
        <Link
          href="https://tiktok.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium transition-colors hover:text-foreground"
        >
          TikTok
        </Link>
      </nav>
    </footer>
  );
}
