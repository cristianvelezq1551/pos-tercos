'use client';

import { pocketOf, type PocketSplit } from '@pos-tercos/types';
import { cn, formatCop } from '@pos-tercos/ui';
import { Banknote, HelpCircle, Landmark, Split } from 'lucide-react';

const ICONOS = { EFECTIVO: Banknote, CUENTA: Landmark, MIXTO: Split } as const;
export const POCKET_PALABRAS = { EFECTIVO: 'Efectivo', CUENTA: 'Cuenta', MIXTO: 'Mixto' } as const;

/** Lo que se lee al pasar el mouse y lo que oye un lector de pantalla. */
function describir(kind: 'EFECTIVO' | 'CUENTA' | 'MIXTO', cash: number, bank: number): string {
  if (kind === 'MIXTO') return `Mixto: ${formatCop(cash)} en efectivo y ${formatCop(bank)} de la cuenta`;
  return kind === 'EFECTIVO'
    ? `Salió en efectivo: ${formatCop(cash)}`
    : `Salió de la cuenta: ${formatCop(bank)}`;
}

/**
 * De qué bolsillo salió un pago: efectivo, cuenta o mixto.
 *
 * Es SOLO un icono. Estas listas repiten el dato en cada fila, y una palabra
 * por fila —peor aún, una palabra dentro de un chip— pesa más que el monto y
 * convierte la lista en ruido. Un billete y un banco se distinguen de un golpe
 * de vista, que es como se barre una lista de pagos.
 *
 * Lo que un icono solo no puede hacer es enseñarse a sí mismo, así que:
 * `title` con el desglose, `aria-label` para lectores de pantalla, y una
 * leyenda por sección (`PocketLegend`) que dice qué es cada uno.
 *
 * Un pago SIN reparto registrado no se pinta, salvo `mostrarSinDato`: no se
 * sabe de dónde salió, y dar por sentado "Cuenta" —el default del formulario—
 * inventaría justo el dato que se quiere auditar.
 */
export function PocketBadge({
  pago,
  conPalabra = false,
  mostrarSinDato = false,
  className,
}: {
  pago: PocketSplit;
  /** Añade la palabra al lado. Solo en pantallas de DETALLE, donde el dato
   *  aparece una vez y no hay lista que barrer. */
  conPalabra?: boolean;
  mostrarSinDato?: boolean;
  className?: string;
}) {
  const kind = pocketOf(pago);

  if (kind === null) {
    if (!mostrarSinDato) return null;
    const aviso = 'No quedó registrado de qué bolsillo salió este pago';
    return (
      <span
        className={cn('inline-flex shrink-0 items-center gap-1 text-muted-foreground', className)}
        title={aviso}
        aria-label={aviso}
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {conPalabra ? 'Sin registrar' : null}
      </span>
    );
  }

  const Icono = ICONOS[kind];
  const texto = describir(kind, pago.cashAmount ?? 0, pago.bankAmount ?? 0);

  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-muted-foreground', className)}
      title={texto}
      aria-label={texto}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {conPalabra ? POCKET_PALABRAS[kind] : null}
    </span>
  );
}

/**
 * Qué significa cada icono. Va UNA vez por sección, no por fila: es lo que
 * hace que un icono solo sea legible sin repetir la palabra 40 veces.
 */
export function PocketLegend({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3 text-xs text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1">
        <Banknote className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> efectivo
      </span>
      <span className="inline-flex items-center gap-1">
        <Landmark className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> cuenta
      </span>
      <span className="inline-flex items-center gap-1">
        <Split className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> mixto
      </span>
    </span>
  );
}
