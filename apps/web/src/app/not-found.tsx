import Link from 'next/link';

/** §3.5: 404 con branding (antes caía al default de Next, en inglés y sin marca). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-display text-7xl font-extrabold text-foreground">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">No encontramos esta página</h1>
        <p className="text-sm text-muted-foreground">
          El enlace puede estar vencido o mal escrito.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Ir al menú
      </Link>
    </main>
  );
}
