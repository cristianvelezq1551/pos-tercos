'use client';

import type { Sale } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { VoidModal } from './VoidModal';

export function VoidSaleAction({ shiftId }: { shiftId: string | null }) {
  const [open, setOpen] = useState(false);
  const [lastVoided, setLastVoided] = useState<Sale | null>(null);

  const handleSuccess = (sale: Sale) => {
    setLastVoided(sale);
    // Banner se autoborrar a los 5s
    setTimeout(() => setLastVoided(null), 5000);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!shiftId}
        title={shiftId ? 'Anular una venta del turno actual' : 'Abre un turno primero'}
      >
        Anular
      </Button>
      <VoidModal
        open={open}
        shiftId={shiftId}
        onClose={() => setOpen(false)}
        onSuccess={handleSuccess}
      />
      {lastVoided ? (
        <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          Anulada #{lastVoided.receiptNumber}
        </span>
      ) : null}
    </>
  );
}
