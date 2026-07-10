'use client';

import type { Shift } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloseShiftModal } from './CloseShiftModal';

export function CloseShiftAction({ shift }: { shift: Shift | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleClosed = () => {
    setOpen(false);
    // El gate del home redirige a /shift/open al detectar que no hay shift OPEN.
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
