'use client';

import type { Shift } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloseShiftModal } from './CloseShiftModal';

/**
 * Bloquea la operación cuando el cajero dejó la caja abierta de un día anterior.
 * Obliga a cerrarla (Cerrar turno, ingresando el efectivo con el que quedó)
 * antes de poder abrir la caja de hoy. Cerrar NO es lo mismo que salir/cerrar
 * sesión: el cierre registra el efectivo contado y la hora de cierre.
 */
export function StaleShiftGate({ shift }: { shift: Shift }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const openedDate = new Date(shift.openedAt).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleClosed = () => {
    setOpen(false);
    // Caja cerrada → ya no hay turno OPEN; ir a abrir la de hoy.
    router.replace('/caja/shift/open');
    router.refresh();
  };

  return (
    <div className="flex h-full items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-warning-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg">
          <AlertTriangle className="h-6 w-6 text-warning" strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Cierra la caja anterior
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Quedó una caja abierta del <span className="font-semibold text-foreground">{openedDate}</span>.
            No puedes vender ni hacer movimientos hasta cerrarla.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cerrar turno registra el efectivo con el que quedó y la hora de
            cierre. Después vas a poder abrir la caja de hoy.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
          Cerrar turno anterior
        </Button>
      </div>

      <CloseShiftModal
        shift={shift}
        open={open}
        onClose={() => setOpen(false)}
        onClosed={handleClosed}
      />
    </div>
  );
}
