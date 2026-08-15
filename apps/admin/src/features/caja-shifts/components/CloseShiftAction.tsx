'use client';

import type { Shift } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloseShiftModal } from './CloseShiftModal';

export function CloseShiftAction({
  shift,
  onClosed,
}: {
  shift: Shift | null;
  onClosed?: (closed: Shift) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleClosed = (closed: Shift) => {
    setOpen(false);
    // El refresh actualiza la barra superior (pasa a "sin turno"); quien muestra
    // la confirmación del cierre es el padre, con el turno ya cerrado.
    onClosed?.(closed);
    router.refresh();
  };

  if (!shift) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cerrar turno
      </Button>
      <CloseShiftModal
        shift={shift}
        open={open}
        onClose={() => setOpen(false)}
        onClosed={handleClosed}
      />
    </>
  );
}
