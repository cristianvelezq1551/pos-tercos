'use client';

import { Button, Dialog } from '@pos-tercos/ui';
import { DayHistoryPanel } from './DayHistoryPanel';

export function DayHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pedidos del día"
      description="Historial del día con filtros y reimpresión"
      maxWidth="max-w-2xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="h-[60vh]">
        <DayHistoryPanel active={open} />
      </div>
    </Dialog>
  );
}
