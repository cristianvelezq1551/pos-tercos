'use client';

import type { Shift } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { CajaModal } from './CajaModal';

export function CajaAction({ shift }: { shift: Shift | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!shift}
        title={shift ? 'Ver cómo va la caja' : 'Abre un turno primero'}
      >
        Caja
      </Button>
      <CajaModal shift={shift} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
