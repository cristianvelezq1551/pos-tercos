import { PAYMENT_METHOD_LABELS, type ShiftSessionDetail } from '@pos-tercos/types';
import { formatCop } from '../../../lib/format';

/** Movimientos de efectivo + arqueo por denominación. Null si no hay nada que mostrar. */
export function ShiftCashSection({
  cashMovements,
  cashCountBreakdown,
}: {
  cashMovements: ShiftSessionDetail['cashMovements'];
  cashCountBreakdown: ShiftSessionDetail['cashCountBreakdown'];
}) {
  if (cashMovements.length === 0 && !cashCountBreakdown) return null;
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {cashMovements.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Movimientos de caja
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <tbody className="divide-y divide-border">
                {cashMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          m.type === 'IN'
                            ? 'font-medium text-success'
                            : 'font-medium text-destructive'
                        }
                      >
                        {m.type === 'IN' ? 'Entrada' : 'Salida'}
                      </span>
                      {m.method !== 'CASH' ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {PAYMENT_METHOD_LABELS[m.method]}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground"> · {m.reason}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                      {m.type === 'IN' ? '' : '−'}
                      {formatCop(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {cashCountBreakdown && cashCountBreakdown.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Arqueo por denominación
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <tbody className="divide-y divide-border">
                {cashCountBreakdown.map((b) => (
                  <tr key={b.denomination}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatCop(b.denomination)} × {b.count}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                      {formatCop(b.denomination * b.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
