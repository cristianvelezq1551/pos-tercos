'use client';

import type { Sale } from '@pos-tercos/types';
import { Badge, Button } from '@pos-tercos/ui';
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
        <Badge tone="warning" size="md" className="ml-1">
          Anulada #{lastVoided.receiptNumber}
        </Badge>
      ) : null}
    </>
  );
}
