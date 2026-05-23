'use client';

import { Button, Dialog } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getDisplayState } from '../api/client';
import { TurnPanel } from './TurnPanel';

const BADGE_POLL_MS = 8000;

export function TurnAction() {
  const [open, setOpen] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);

  // Solo para el badge del botón. El polling pesado vive en TurnPanel.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getDisplayState();
        if (!cancelled) setCurrentTurn(s.currentTurn);
      } catch {
        /* la pantalla pública es la fuente de verdad */
      }
    };
    void tick();
    const id = setInterval(tick, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Turnos: llamar pedidos listos a la pantalla pública"
      >
        Turnos · #{currentTurn ?? '—'}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Turnos en pantalla"
        description="Llama a la pantalla pública los pedidos que la cocina marcó listos."
        maxWidth="max-w-lg"
        footer={
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <TurnPanel active={open} />
      </Dialog>
    </>
  );
}
