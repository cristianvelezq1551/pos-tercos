'use client';

import { Money, cn } from '@pos-tercos/ui';
import { ArrowDownRight, ArrowUpRight, Check, TriangleAlert } from 'lucide-react';

const DISCREPANCY_THRESHOLD = 5000;

type Tone = 'success' | 'warning' | 'destructive';

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
 * Resultado del arqueo de efectivo: cuadra / sobra / falta, con la magnitud
 * de la diferencia (contado − esperado). Sobre el umbral de anomalía muestra
 * el aviso de que queda registrado y se notifica al dueño.
 */
export function DifferenceWidget({ difference }: { difference: number }) {
  const exact = Math.abs(difference) < 1;
  const surplus = difference > 0;
  const flagged = !exact && Math.abs(difference) >= DISCREPANCY_THRESHOLD;

  const tone: Tone = exact ? 'success' : surplus ? 'warning' : 'destructive';
  const styles = TONE[tone];
  const Icon = exact ? Check : surplus ? ArrowUpRight : ArrowDownRight;

  const title = exact ? 'La caja cuadra' : surplus ? 'Sobra efectivo' : 'Falta efectivo';
  const subtitle = exact
    ? 'El conteo coincide con lo esperado.'
    : surplus
      ? 'Hay más efectivo en caja del esperado.'
      : 'Hay menos efectivo en caja del esperado.';

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
        <Money
          amount={difference}
          size="2xl"
          weight="bold"
          withSign
          className="shrink-0 text-current"
        />
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
