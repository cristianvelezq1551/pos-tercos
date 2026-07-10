'use client';

import { PAYMENT_METHOD_LABELS } from '@pos-tercos/types';
import { Money, NumberInput } from '@pos-tercos/ui';
import type { ShiftSummary } from '../lib/shift-summary';

const DIGITAL_LABELS: Record<string, string> = PAYMENT_METHOD_LABELS;

/**
 * Métodos NO-efectivo con plata en el turno: ventas y/o movimientos
 * digitales registrados (un egreso por transferencia también se arquea).
 */
export function digitalMethodsOf(
  summary: ShiftSummary,
  digitalNet: Record<string, number> = {},
): string[] {
  const fromSales = Object.keys(summary.byMethod).filter(
    (m) => m !== 'CASH' && m !== 'UNKNOWN' && (summary.byMethod[m]?.total ?? 0) > 0,
  );
  const fromMovs = Object.keys(digitalNet).filter((m) => digitalNet[m] !== 0);
  return Array.from(new Set([...fromSales, ...fromMovs]));
}

/**
 * Arqueo DIGITAL del cierre: el cajero revisa cada app (Nequi/banco) y
 * anota cuánto entró durante el turno. La diferencia contra lo esperado
 * respeta el conteo ciego (no se muestra hasta revelar).
 */
export function DigitalCountSection({
  summary,
  digitalNet = {},
  values,
  onChange,
  showExpected,
  disabled,
}: {
  summary: ShiftSummary;
  /** Neto IN−OUT de movimientos por método digital (ajusta el esperado). */
  digitalNet?: Record<string, number>;
  values: Record<string, number | null>;
  onChange: (method: string, value: number | null) => void;
  showExpected: boolean;
  disabled: boolean;
}) {
  const methods = digitalMethodsOf(summary, digitalNet);
  if (methods.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="caps text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground">
        Arqueo digital · según cada app
      </h3>
      {methods.map((m) => {
        const expected = (summary.byMethod[m]?.total ?? 0) + (digitalNet[m] ?? 0);
        const counted = values[m] ?? null;
        const diff = counted !== null ? counted - expected : null;
        return (
          <div key={m} className="flex flex-wrap items-center gap-2">
            <span className="w-32 shrink-0 text-sm text-foreground">{DIGITAL_LABELS[m]}</span>
            <div className="w-36">
              <NumberInput
                value={counted}
                onChange={(v) => onChange(m, v)}
                prefix="$"
                grouping
                min={0}
                placeholder={showExpected ? String(expected) : 'Según la app'}
                disabled={disabled}
                aria-label={`Total según la app de ${DIGITAL_LABELS[m]}`}
              />
            </div>
            {showExpected ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                esperado <Money amount={expected} size="xs" className="text-current" />
              </span>
            ) : null}
            {showExpected && diff !== null && diff !== 0 ? (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  diff < 0 ? 'text-destructive' : 'text-warning'
                }`}
              >
                {diff > 0 ? '+' : ''}
                <Money amount={diff} size="xs" className="text-current" />{' '}
                {diff < 0 ? 'faltante' : 'sobrante'}
              </span>
            ) : null}
            {showExpected && diff === 0 ? (
              <span className="text-xs font-semibold text-success">cuadra ✓</span>
            ) : null}
          </div>
        );
      })}
      <p className="text-[0.6875rem] text-muted-foreground">
        Sumá los movimientos del turno en cada app. Si dejás un método vacío, no se arquea.
      </p>
    </section>
  );
}
