'use client';

import { useState } from 'react';
import type { InventoryMovement } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { ReverseWasteModal } from './ReverseWasteModal';

interface ReverseWasteActionProps {
  movement: InventoryMovement;
}

/** Botón + modal para anular una merma. Isla cliente dentro de la tabla server. */
export function ReverseWasteAction({ movement }: ReverseWasteActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Anular
      </Button>
      {open ? (
        <ReverseWasteModal movement={movement} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
