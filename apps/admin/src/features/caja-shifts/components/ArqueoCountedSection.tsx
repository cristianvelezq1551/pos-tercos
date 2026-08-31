'use client';

import { PAYMENT_METHOD_LABELS, type ShiftSessionDetail } from '@pos-tercos/types';
import { Money, cn } from '@pos-tercos/ui';
import { SectionRow } from './ArqueoBreakdown';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

/**
 * "Según usuario" del arqueo: lo que el cajero contó al cerrar (efectivo +
 * arqueo digital por método) y la fila de Diferencia contra lo esperado.
 */
export function ArqueoCountedSection({ shift }: { shift: ShiftSessionDetail['shift'] }) {
  // Según usuario: efectivo contado + arqueo digital por método.
  const digital = shift.digitalCountBreakdown ?? [];
  const countedRows: Array<{ method: string; amount: number | null }> = [
    { method: 'CASH', amount: shift.countedCash },
    ...digital.map((d) => ({ method: d.method as string, amount: d.counted })),
  ];
  const countedTotal = countedRows.reduce((a, r) => a + (r.amount ?? 0), 0);
  const diffTotal = (shift.difference ?? 0) + digital.reduce((a, d) => a + (d.difference ?? 0), 0);

  return (
    <>
      {/* Lo que el cajero contó al cerrar */}
      <p className="caps border-t border-border bg-muted/50 px-3 py-1.5 text-[0.625rem] font-bold tracking-[0.2em] text-muted-foreground">
        Según usuario
      </p>
      {countedRows.map((r) => (
        <div
          key={`counted-${r.method}`}
          className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-sm"
        >
          <span className="text-muted-foreground">{label(r.method)}</span>
          {r.amount !== null ? (
            <Money amount={r.amount} size="sm" weight="medium" />
          ) : (
            <span className="text-xs text-muted-foreground">sin arquear</span>
          )}
        </div>
      ))}
      <SectionRow title="Total" amount={countedTotal} strong />

      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5',
          diffTotal === 0 ? 'bg-success/15' : diffTotal < 0 ? 'bg-destructive/15' : 'bg-success/15',
        )}
      >
        <span className="text-sm font-bold uppercase tracking-wide text-foreground">
          Diferencia
        </span>
        <span
          className={cn(
            'text-base font-bold tabular-nums',
            diffTotal === 0 ? 'text-success' : diffTotal < 0 ? 'text-destructive' : 'text-success',
          )}
        >
          {diffTotal === 0 ? (
            'Cuadró ✓'
          ) : (
            <>
              {diffTotal > 0 ? '+' : ''}
              <Money amount={diffTotal} weight="bold" className="text-current" />
            </>
          )}
        </span>
      </div>
    </>
  );
}
