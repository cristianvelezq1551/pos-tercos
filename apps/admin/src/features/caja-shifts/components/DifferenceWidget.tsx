'use client';

import { Money, cn } from '@pos-tercos/ui';
import { ArrowDownRight, ArrowUpRight, Check, TriangleAlert } from 'lucide-react';

const DISCREPANCY_THRESHOLD = 5000;

type Tone = 'success' | 'warning' | 'destructive';

/** "+$1.000" / "−$25.000" para el detalle por pata. */
function signed(amount: number): string {
  return `${amount > 0 ? '+' : '−'}$${Math.abs(Math.round(amount)).toLocaleString('es-CO')}`;
}

const TONE: Record<Tone, { container: string; badge: string }> = {
  success: {
    container: 'border-success-border bg-success-bg text-success',
    badge: 'bg-success/15',
  },
  warning: {
    container: 'border-warning-border bg-warning-bg text-warning',
    badge: 'bg-warning/15',
  },
  destructive: {
    container: 'border-destructive/30 bg-destructive/10 text-destructive',
    badge: 'bg-destructive/15',
  },
};

/**
 * Resultado del arqueo: cuadra / sobra / falta. El número grande es el
 * descuadre TOTAL (efectivo + cuenta) — mostrar solo el del cajón daba una
 * caja "cuadrada" con plata digital descuadrada al lado.
 */
export function DifferenceWidget({
  difference,
  accountDifference = 0,
  accountPending = 0,
}: {
  /** Contado − esperado del cajón. */
  difference: number;
  /** Contado − esperado de los medios de cuenta ya arqueados. */
  accountDifference?: number;
  /** Medios de cuenta todavía sin contar (el total aún no es definitivo). */
  accountPending?: number;
}) {
  const total = difference + accountDifference;
  const exact = Math.abs(total) < 1;
  const surplus = total > 0;
  const flagged = !exact && Math.abs(total) >= DISCREPANCY_THRESHOLD;
  const split = Math.abs(accountDifference) >= 1 && Math.abs(difference) >= 1;

  const tone: Tone = exact ? 'success' : surplus ? 'warning' : 'destructive';
  const styles = TONE[tone];
  const Icon = exact ? Check : surplus ? ArrowUpRight : ArrowDownRight;

  const title = exact ? 'La caja cuadra' : surplus ? 'Sobra plata' : 'Falta plata';
  const subtitle =
    accountPending > 0
      ? `Faltan ${accountPending} medio(s) de cuenta por contar: el total todavía no es definitivo.`
      : split
        ? `Efectivo ${signed(difference)} · cuenta ${signed(accountDifference)}`
        : exact
          ? 'El conteo coincide con lo esperado.'
          : Math.abs(accountDifference) >= 1
            ? 'La diferencia está en la cuenta, no en el cajón.'
            : 'La diferencia está en el cajón.';

  return (
    <div className={cn('rounded-xl border p-3.5', styles.container)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            styles.badge,
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs leading-tight opacity-80">{subtitle}</p>
        </div>
        <Money amount={total} size="2xl" weight="bold" withSign className="shrink-0 text-current" />
      </div>

      {flagged ? (
        <div className="mt-3 flex items-start gap-1.5 border-t border-current/15 pt-2.5 text-[0.6875rem] leading-snug">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Descuadre de $5.000 o más: queda registrado como anomalía y se avisa al dueño.
          </span>
        </div>
      ) : null}
    </div>
  );
}
