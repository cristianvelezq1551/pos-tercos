'use client';

import type { Shift } from '@pos-tercos/types';
import { Money, buttonVariants, formatDate } from '@pos-tercos/ui';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { DifferenceWidget } from './DifferenceWidget';

/**
 * Confirmación del cierre. Antes de esto la vista quedaba en blanco: la página
 * redirigía al abrir turno y el redirect no se aplicaba durante el refresh, así
 * que el cajero no veía si su caja había quedado cerrada ni cómo cuadró.
 */
export function ShiftClosedCard({ shift }: { shift: Shift }) {
  const expected = shift.expectedCash ?? 0;
  const counted = shift.countedCash ?? 0;
  const difference = shift.difference ?? counted - expected;
  const tips = shift.tipsCollected ?? 0;
  // Descuadre de la cuenta (arqueo digital): sin esto la tarjeta decía "La
  // caja cuadra" con la cuenta descuadrada, contradiciendo al modal de cierre.
  const accountDifference = (shift.digitalCountBreakdown ?? []).reduce(
    (a, l) => a + (l.difference ?? 0),
    0,
  );

  return (
    <div className="space-y-4 rounded-2xl border border-success-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-bg"
          aria-hidden
        >
          <CheckCircle2 className="h-6 w-6 text-success" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-foreground">
            Turno cerrado
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(shift.openedAt, 'datetime')} →{' '}
            {shift.closedAt ? formatDate(shift.closedAt, 'datetime') : 'ahora'}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border">
        <Row label="Efectivo esperado" amount={expected} />
        <Row label="Efectivo contado" amount={counted} />
        {tips > 0 ? <Row label="Propinas (bote aparte)" amount={tips} /> : null}
      </dl>

      <DifferenceWidget difference={difference} accountDifference={accountDifference} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/caja/shift/open"
          className={buttonVariants({ size: 'lg', className: 'flex-1' })}
        >
          Abrir nuevo turno
        </Link>
        <Link
          href="/caja/arqueos"
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'flex-1' })}
        >
          Ver el arqueo
        </Link>
      </div>
    </div>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <Money amount={amount} weight="semibold" />
      </dd>
    </div>
  );
}
