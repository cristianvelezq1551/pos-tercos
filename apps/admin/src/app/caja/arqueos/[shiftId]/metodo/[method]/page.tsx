import { MethodSalesView } from '../../../../../../features/caja-shifts/components/MethodSalesView';

export const dynamic = 'force-dynamic';

/** Ventas de un método de pago dentro de una caja (drill-down del arqueo). */
export default async function MethodSalesPage({
  params,
}: {
  params: Promise<{ shiftId: string; method: string }>;
}) {
  const { shiftId, method } = await params;
  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto p-4">
      <MethodSalesView shiftId={shiftId} method={decodeURIComponent(method)} />
    </div>
  );
}
