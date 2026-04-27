export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        APP: repa (puerto 3006)
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">App Repartidor — POS Tercos</h1>
      <p className="mt-4 max-w-md text-gray-600">
        Placeholder. La superficie se construye en FASE 10: Lista de pedidos asignados con mapa Mapbox, sort Haversine, cambio de estados.
      </p>
      <p className="mt-8 text-sm text-gray-400">v0.0.0 · FASE 0 · setup</p>
    </main>
  );
}
