'use client';

import type { Shift } from '@pos-tercos/types';
import { buttonVariants } from '@pos-tercos/ui';
import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CajaPanel } from './CajaPanel';
import { ShiftClosedCard } from './ShiftClosedCard';

/**
 * Pantalla de Caja. Decide entre operar el turno, la confirmación del cierre y
 * el estado sin turno. Vive en el cliente a propósito: el cierre dispara un
 * `router.refresh()` que vuelve a correr la página con `shift = null`, y el
 * resultado del cierre solo sobrevive a ese refresh si lo guarda un componente
 * cliente que no se desmonta. La página NO debe redirigir cuando no hay turno
 * (esa era la causa de que la vista quedara en blanco al cerrar).
 */
export function CajaScreen({ shift }: { shift: Shift | null }) {
  const [closed, setClosed] = useState<Shift | null>(null);

  // Un turno NUEVO llegado por props (abierto desde otro dispositivo tras el
  // cierre) manda sobre la confirmación guardada: sin este guard la pantalla
  // se quedaba en "Turno cerrado" hasta navegar.
  const showClosed = closed !== null && (shift === null || shift.id === closed.id);
  if (showClosed && closed) return <ShiftClosedCard shift={closed} />;
  if (shift) return <CajaPanel shift={shift} onClosed={setClosed} />;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
      <span
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"
        aria-hidden
      >
        <Wallet className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight text-foreground">
          No hay ningún turno abierto
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Abre la caja con el efectivo inicial para empezar a vender.
        </p>
      </div>
      <Link
        href="/caja/shift/open"
        className={buttonVariants({ size: 'lg', className: 'w-full' })}
      >
        Abrir turno
      </Link>
    </div>
  );
}
