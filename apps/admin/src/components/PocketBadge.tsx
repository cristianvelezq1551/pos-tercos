'use client';

import { pocketOf, type PocketSplit } from '@pos-tercos/types';
import { Badge, cn, formatCop } from '@pos-tercos/ui';
import { Banknote, Landmark, Split } from 'lucide-react';

/**
 * De qué bolsillo salió un pago: Efectivo, Cuenta o Mixto.
 *
 * Es el MISMO dato que pide `PocketPaymentField` al pagar, así que la palabra
 * es la misma en los dos lados. Antes cada pantalla lo rendía con su propia
 * cadena de ternarios y ya habían divergido: una imprimía el monto sin formato
 * ("Efectivo 50000") y otra decía "Cuenta (transferencia)".
 *
 * Un pago SIN reparto registrado no se pinta (devuelve `null`) salvo que se
 * pida `mostrarSinDato`: no se sabe de dónde salió, y dar por sentado "Cuenta"
 * —el default del formulario— inventaría justo el dato que se quiere auditar.
 */
export function PocketBadge({
  pago,
  size = 'sm',
  mostrarSinDato = false,
  className,
}: {
  pago: PocketSplit;
  size?: 'sm' | 'md';
  mostrarSinDato?: boolean;
  className?: string;
}) {
  const kind = pocketOf(pago);

  if (kind === null) {
    if (!mostrarSinDato) return null;
    return (
      <Badge
        tone="neutral"
        variant="outline"
        size={size}
        className={cn('shrink-0', className)}
        title="Este pago se registró antes de que se guardara de qué bolsillo salía"
      >
        Sin registrar
      </Badge>
    );
  }

  const cash = pago.cashAmount ?? 0;
  const bank = pago.bankAmount ?? 0;

  if (kind === 'MIXTO') {
    return (
      <Badge
        tone="neutral"
        size={size}
        className={cn('shrink-0 font-normal', className)}
        title={`Efectivo ${formatCop(cash)} · Cuenta ${formatCop(bank)}`}
      >
        <Split className="h-3 w-3" strokeWidth={2} /> Mixto
      </Badge>
    );
  }

  const esEfectivo = kind === 'EFECTIVO';
  return (
    <Badge
      tone="neutral"
      size={size}
      className={cn('shrink-0 font-normal', className)}
      title={esEfectivo ? `Salió en efectivo: ${formatCop(cash)}` : `Salió de la cuenta: ${formatCop(bank)}`}
    >
      {esEfectivo ? (
        <>
          <Banknote className="h-3 w-3" strokeWidth={2} /> Efectivo
        </>
      ) : (
        <>
          <Landmark className="h-3 w-3" strokeWidth={2} /> Cuenta
        </>
      )}
    </Badge>
  );
}

/**
 * El desglose en texto, para donde no cabe un badge (una línea de detalle).
 * Devuelve `null` si el pago no tiene reparto registrado.
 */
export function detallePocket(pago: PocketSplit): string | null {
  const kind = pocketOf(pago);
  if (kind === null) return null;
  const cash = pago.cashAmount ?? 0;
  const bank = pago.bankAmount ?? 0;
  if (kind === 'MIXTO') return `Efectivo ${formatCop(cash)} · Cuenta ${formatCop(bank)}`;
  return kind === 'EFECTIVO' ? `Efectivo ${formatCop(cash)}` : `Cuenta ${formatCop(bank)}`;
}
