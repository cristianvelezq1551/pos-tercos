export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        APP: pos (puerto 3002)
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">POS Cajero — POS Tercos</h1>
      <p className="mt-4 max-w-md text-gray-600">
        Placeholder. La superficie se construye en FASE 5: Venta en mostrador con offline + impresora ESC/POS + cajón monedero.
      </p>
      <p className="mt-8 text-sm text-gray-400">v0.0.0 · FASE 0 · setup</p>
    </main>
  );
}
