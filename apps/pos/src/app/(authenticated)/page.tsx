import { redirect } from 'next/navigation';
import { getCurrentShiftServer } from '../../features/shifts/server';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export default async function PosHomePage() {
  const shift = await getCurrentShiftServer();
  if (!shift) {
    redirect('/shift/open');
  }
  const opened = new Date(shift.openedAt).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className="flex h-full flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        Turno abierto
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Listo para vender</h1>
      <p className="mt-2 text-sm text-gray-600">
        Apertura: {opened} · Efectivo inicial {COP.format(shift.openingCash)}
      </p>
      <p className="mt-6 max-w-md text-sm text-gray-500">
        Próximo bloque (5.E.3): grid de catálogo + selector de tamaños/modificadores.
      </p>
    </div>
  );
}
