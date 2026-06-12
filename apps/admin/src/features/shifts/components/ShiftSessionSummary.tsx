import type { ShiftSessionDetail } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

export function ShiftSessionSummary({
  summary,
  tipsCollected = null,
}: {
  summary: ShiftSessionDetail['summary'];
  /** Propinas del día (efectivo aparte de la caja). */
  tipsCollected?: number | null;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <SummaryCard label="Pedidos" value={String(summary.orderCount)} />
      <SummaryCard label="Pagados" value={String(summary.paidCount)} />
      <SummaryCard label="Anulados" value={String(summary.voidCount)} />
      <SummaryCard label="Ingresos" value={formatCop(summary.totalRevenue)} wide />
      <SummaryCard label="Efectivo" value={formatCop(summary.cashRevenue)} wide />
      <SummaryCard label="Digital" value={formatCop(summary.transferRevenue)} wide />
      {tipsCollected !== null ? (
        <SummaryCard label="Propinas (aparte)" value={formatCop(tipsCollected)} wide />
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={`font-semibold tabular-nums text-foreground ${wide ? 'text-base' : 'text-xl'}`}
      >
        {value}
      </p>
    </div>
  );
}
