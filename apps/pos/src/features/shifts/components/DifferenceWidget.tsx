'use client';

import { Money, cn } from '@pos-tercos/ui';

const DISCREPANCY_THRESHOLD = 5000;

export function DifferenceWidget({
  difference,
}: {
  difference: number;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 text-sm',
        Math.abs(difference) < 1
          ? 'border-success-border bg-success-bg text-success'
          : difference < 0
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-warning-border bg-warning-bg text-warning',
      )}
    >
      <div className="flex items-center justify-between">
        <span>Diferencia (counted − expected)</span>
        <Money
          amount={difference}
          size="lg"
          weight="bold"
          withSign
          className="text-current"
        />
      </div>
      {Math.abs(difference) >= DISCREPANCY_THRESHOLD ? (
        <p className="mt-1 text-[0.6875rem]">
          Descuadre ≥ $5.000 — se registra en audit como anomalía.
        </p>
      ) : null}
    </div>
  );
}
