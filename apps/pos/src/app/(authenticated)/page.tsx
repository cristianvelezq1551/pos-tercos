export default function PosHomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        Sprint 5.E.1 — scaffold listo
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">POS Cajero</h1>
      <p className="mt-3 max-w-md text-gray-600">
        Auth + middleware activos. Próximo bloque (5.E.2): gate de apertura de turno con efectivo
        inicial antes de poder vender.
      </p>
    </div>
  );
}
