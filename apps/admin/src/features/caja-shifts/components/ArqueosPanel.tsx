'use client';

import type { Shift } from '@pos-tercos/types';
import { LoadingSkeleton, Money, formatDate } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listClosedShifts } from '../api/list';
import { ArqueoDetail } from './ArqueoDetail';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Historial de arqueos: cada cierre de caja con su resultado. Tocar una
 * fila abre el detalle completo (vendido, por método, movimientos,
 * arqueo digital, descuadre).
 */
export function ArqueosPanel() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClosedShifts()
      .then((rows) => {
        if (!cancelled) setShifts(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Error cargando arqueos'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {error}
      </p>
    );
  }
  if (shifts === null) return <LoadingSkeleton shape="text" count={6} />;
  if (shifts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Todavía no hay cierres de caja registrados.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shifts.map((s) => {
        const open = openId === s.id;
        const diff = s.difference ?? 0;
        return (
          <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : s.id)}
              aria-expanded={open}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="min-w-32 text-sm font-medium text-foreground">
                {formatDate(s.closedAt ?? s.openedAt, 'short')}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.cashierName ?? '—'} · {formatDate(s.openedAt, 'time')} →{' '}
                {s.closedAt ? formatDate(s.closedAt, 'time') : '—'}
              </span>
              <span className="ml-auto flex items-center gap-3 text-sm tabular-nums">
                <span className="text-muted-foreground">
                  contado <Money amount={s.countedCash ?? 0} size="sm" className="text-current" />
                </span>
                {diff === 0 ? (
                  <span className="font-semibold text-success">cuadró ✓</span>
                ) : (
                  <span
                    className={`font-semibold ${diff < 0 ? 'text-destructive' : 'text-warning'}`}
                  >
                    {diff > 0 ? '+' : ''}
                    <Money amount={diff} size="sm" className="text-current" />
                  </span>
                )}
                <span aria-hidden className="text-muted-foreground">
                  {open ? '▾' : '▸'}
                </span>
              </span>
            </button>
            {open ? <ArqueoDetail shiftId={s.id} /> : null}
          </div>
        );
      })}
    </div>
  );
}
