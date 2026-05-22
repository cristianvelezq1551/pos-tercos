'use client';

import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { DayHistoryModal } from './DayHistoryModal';

export function DayHistoryAction() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Ver los pedidos del día y su estado"
      >
        Historial
      </Button>
      <DayHistoryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
