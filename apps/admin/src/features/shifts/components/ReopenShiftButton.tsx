'use client';

import { Button } from '@pos-tercos/ui';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { reopenShift } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Reabre la caja del día si fue cerrada por error. Conserva el monto de apertura
 * — no crea una sesión nueva. Solo admin/dueño.
 */
export function ReopenShiftButton({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReopen = async () => {
    setBusy(true);
    setError(null);
    try {
      await reopenShift(shiftId);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'Error al reabrir'));
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
        Reabrir caja
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning-border/40 bg-warning-bg/20 p-3">
      <p className="text-sm text-foreground">
        ¿Reabrir esta caja? Se conserva el monto de apertura y se reanuda la sesión del día.
        El cajero podrá volver a cerrarla.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="default" size="sm" onClick={handleReopen} disabled={busy}>
          {busy ? 'Reabriendo…' : 'Sí, reabrir'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
