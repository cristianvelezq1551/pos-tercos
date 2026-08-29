import Link from 'next/link';

/**
 * 404 propio: sin esto cae el de Next, que sale en INGLÉS ("This page could not
 * be found") en una app que es toda en español. Se destapó cuando un cocinero
 * abre un flujo de la guía que no le toca. Mismo tono que el de la web (§3.5).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-display text-7xl font-extrabold text-foreground">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Esto no está por aquí</h1>
        <p className="text-sm text-muted-foreground">
          El enlace puede estar viejo, o ser de una sección que no te toca.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors active:opacity-90"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
