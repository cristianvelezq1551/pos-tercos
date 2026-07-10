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
    <section className="flex flex-wrap gap-3">
      <SummaryCard label="Pedidos" value={String(summary.orderCount)} />
      <SummaryCard label="Pagados" value={String(summary.paidCount)} />
      <SummaryCard
        label="Anulados"
        value={String(summary.voidCount)}
        emphasize={summary.voidCount > 0}
      />
      <SummaryCard
        label="Cancelados"
        value={String(summary.canceledCount)}
        emphasize={summary.canceledCount > 0}
      />
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
  emphasize,
}: {
  label: string;
  value: string;
  wide?: boolean;
  /** Resalta en rojo (cuentas "malas": anulados/cancelados con valor > 0). */
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card px-3 py-3 ${
        // Cuentas (Pedidos/Pagados/…): compactas, no crecen. Montos: crecen a llenar.
        wide ? 'min-w-[8.5rem] flex-[1_1_8.5rem]' : 'min-w-[5.5rem] flex-none'
      }`}
    >
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={`font-semibold tabular-nums ${wide ? 'text-base' : 'text-xl'} ${
          emphasize ? 'text-destructive' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
