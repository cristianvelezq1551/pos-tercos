'use client';

import { pocketOf, type PocketSplit } from '@pos-tercos/types';
import { Badge, cn, formatCop } from '@pos-tercos/ui';
import { Banknote, Landmark, Split } from 'lucide-react';

const ICONOS = { EFECTIVO: Banknote, CUENTA: Landmark, MIXTO: Split } as const;
const PALABRAS = { EFECTIVO: 'Efectivo', CUENTA: 'Cuenta', MIXTO: 'Mixto' } as const;

/** El desglose completo, para el `title` — en MIXTO es el dato que falta a la vista. */
function detalle(kind: 'EFECTIVO' | 'CUENTA' | 'MIXTO', cash: number, bank: number): string {
  if (kind === 'MIXTO') return `Efectivo ${formatCop(cash)} · Cuenta ${formatCop(bank)}`;
  return kind === 'EFECTIVO'
    ? `Salió en efectivo: ${formatCop(cash)}`
    : `Salió de la cuenta: ${formatCop(bank)}`;
}

/**
 * De qué bolsillo salió un pago: Efectivo, Cuenta o Mixto. Misma palabra que
 * usa `PocketPaymentField` al pagar ("¿de qué bolsillo salió?").
 *
 * Dos presentaciones, porque el peso visual que corresponde no es el mismo:
 *
 * - `inline` (por defecto) para las LISTAS de pagos. El bolsillo es metadato,
 *   de la misma familia que la fecha, así que se rinde como ella: icono + texto
 *   tenue, sin fondo ni borde. Un chip claro por fila sobre el tema oscuro
 *   pesa más que el monto y convierte la lista en un muro de etiquetas.
 * - `badge` para una COLUMNA dedicada (la tabla de facturas), donde la celda
 *   existe para este dato y un chip es lo que se espera.
 *
 * El icono es lo que se distingue de un vistazo al barrer la lista (billete vs
 * banco); el texto lo confirma, porque un icono solo es adivinanza.
 *
 * Un pago SIN reparto registrado no se pinta, salvo `mostrarSinDato`: no se
 * sabe de dónde salió, y dar por sentado "Cuenta" —el default del formulario—
 * inventaría justo el dato que se quiere auditar.
 */
export function PocketBadge({
  pago,
  variant = 'inline',
  mostrarSinDato = false,
  className,
}: {
  pago: PocketSplit;
  variant?: 'inline' | 'badge';
  mostrarSinDato?: boolean;
  className?: string;
}) {
  const kind = pocketOf(pago);

  if (kind === null) {
    if (!mostrarSinDato) return null;
    const aviso = 'Este pago se registró antes de que se guardara de qué bolsillo salía';
    return variant === 'badge' ? (
      <Badge tone="neutral" variant="outline" size="sm" className={cn('shrink-0', className)} title={aviso}>
        Sin registrar
      </Badge>
    ) : (
      <span className={cn('shrink-0 italic text-muted-foreground', className)} title={aviso}>
        sin registrar
      </span>
    );
  }

  const Icono = ICONOS[kind];
  const title = detalle(kind, pago.cashAmount ?? 0, pago.bankAmount ?? 0);

  if (variant === 'badge') {
    return (
      <Badge tone="neutral" size="sm" className={cn('shrink-0 font-normal', className)} title={title}>
        <Icono className="h-3 w-3" strokeWidth={2} /> {PALABRAS[kind]}
      </Badge>
    );
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-muted-foreground', className)}
      title={title}
    >
      <Icono className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      {PALABRAS[kind]}
    </span>
  );
}
