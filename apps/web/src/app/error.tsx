'use client';

/** §3.5: error boundary con branding + reintento (antes: pantalla de error
 *  genérica de Next, en inglés y sin marca). */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-display text-6xl font-extrabold text-foreground">¡Ups!</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          Tuvimos un problema cargando esta página. Prueba de nuevo en un momento.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Reintentar
      </button>
    </main>
  );
}
