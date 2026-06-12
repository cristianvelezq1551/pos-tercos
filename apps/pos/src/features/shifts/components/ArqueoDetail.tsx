'use client';

import { PAYMENT_METHOD_LABELS, type ShiftSessionDetail } from '@pos-tercos/types';
import { LoadingSkeleton, Money } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getShiftDetail } from '../api/list';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

/** Detalle expandido de un arqueo: ventas, métodos, movimientos y digital. */
export function ArqueoDetail({ shiftId }: { shiftId: string }) {
  const [detail, setDetail] = useState<ShiftSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShiftDetail(shiftId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  if (error) return <p className="px-3 pb-3 text-sm text-destructive">{error}</p>;
  if (!detail) {
    return (
      <div className="px-3 pb-3">
        <LoadingSkeleton shape="text" count={4} />
      </div>
    );
  }

  const { shift, summary, cashMovements } = detail;
  const movIn = cashMovements.filter((m) => m.type === 'IN').reduce((a, m) => a + m.amount, 0);
  const movOut = cashMovements.filter((m) => m.type === 'OUT').reduce((a, m) => a + m.amount, 0);

  return (
    <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Vendido" value={summary.totalRevenue} />
        <Cell label="Apertura" value={shift.openingCash} />
        <Cell label="Efectivo esperado" value={shift.expectedCash ?? 0} />
        <Cell label="Efectivo contado" value={shift.countedCash ?? 0} />
      </div>

      <div>
        <p className="caps mb-1 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground">
          Por método
        </p>
        <div className="space-y-0.5">
          {summary.byMethod.map((m) => (
            <div key={m.method} className="flex justify-between tabular-nums">
              <span className="text-muted-foreground">
                {label(m.method)} <span className="text-xs">×{m.count}</span>
              </span>
              <Money amount={m.total} size="sm" weight="medium" />
            </div>
          ))}
        </div>
      </div>

      {cashMovements.length > 0 ? (
        <div>
          <p className="caps mb-1 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground">
            Movimientos de caja ({cashMovements.length})
          </p>
          <div className="flex gap-4 tabular-nums">
            <span className="text-success">
              Entradas <Money amount={movIn} size="sm" className="text-current" />
            </span>
            <span className="text-destructive">
              Salidas <Money amount={movOut} size="sm" className="text-current" />
            </span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {cashMovements.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {m.type === 'IN' ? '↑' : '↓'} {m.reason}
                </span>
                <Money amount={m.amount} size="xs" className="text-current" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shift.digitalCountBreakdown && shift.digitalCountBreakdown.length > 0 ? (
        <div>
          <p className="caps mb-1 text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground">
            Arqueo digital
          </p>
          <div className="space-y-0.5 tabular-nums">
            {shift.digitalCountBreakdown.map((d) => (
              <div key={d.method} className="flex justify-between">
                <span className="text-muted-foreground">{label(d.method)}</span>
                <span>
                  <Money amount={d.expected} size="sm" className="text-muted-foreground" /> →{' '}
                  {d.counted !== null ? (
                    <span
                      className={
                        d.difference === 0
                          ? 'font-medium text-success'
                          : d.difference !== null && d.difference < 0
                            ? 'font-semibold text-destructive'
                            : 'font-semibold text-warning'
                      }
                    >
                      <Money amount={d.counted} size="sm" className="text-current" />
                      {d.difference !== null && d.difference !== 0
                        ? ` (${d.difference > 0 ? '+' : ''}${d.difference.toLocaleString('es-CO')})`
                        : ' ✓'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">sin arquear</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {shift.notes ? (
        <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs italic text-muted-foreground">
          “{shift.notes}”
        </p>
      ) : null}
    </div>
  );
}

function Cell({ label: l, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <p className="caps text-[0.5625rem] text-muted-foreground">{l}</p>
      <Money amount={value} weight="semibold" />
    </div>
  );
}
