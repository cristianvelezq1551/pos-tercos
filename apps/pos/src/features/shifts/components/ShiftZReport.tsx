'use client';

import type { Shift } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';

interface ShiftSummary {
  totalSales: number;
  countSales: number;
  byMethod: Record<string, { count: number; total: number }>;
  cashSalesTotal: number;
}

function Row({
  label,
  value,
  bold,
  muted,
  positive,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? 'flex items-center justify-between text-xs text-muted-foreground'
          : 'flex items-center justify-between text-foreground'
      }
    >
      <span>{label}</span>
      <Money
        amount={value}
        size={bold ? 'lg' : 'sm'}
        weight={bold ? 'bold' : 'medium'}
        withSign={positive}
      />
    </div>
  );
}

export function ShiftZReport({
  shift,
  summary,
  expectedCash,
}: {
  shift: Shift;
  summary: ShiftSummary;
  expectedCash: number;
}) {
  return (
    <section className="rounded-xl bg-muted/40 p-4">
      <p className="caps text-[0.625rem] text-muted-foreground">Reporte de cierre del turno</p>
      <div className="mt-3 space-y-1.5 text-sm">
        <Row label="Apertura (efectivo inicial)" value={shift.openingCash} />
        <Row
          label={`Ventas en efectivo (${summary.byMethod.CASH?.count ?? 0})`}
          value={summary.cashSalesTotal}
          positive
        />
        {Object.entries(summary.byMethod)
          .filter(([m]) => m !== 'CASH')
          .map(([method, v]) => (
            <Row
              key={method}
              muted
              label={`${method} (${v.count})`}
              value={v.total}
            />
          ))}
        <div className="border-t border-border pt-2">
          <Row label="Esperado en caja" value={expectedCash} bold />
        </div>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Total ventas del turno: {summary.countSales} ·{' '}
          <Money amount={summary.totalSales} size="xs" weight="medium" className="text-current" />
        </p>
      </div>
    </section>
  );
}
