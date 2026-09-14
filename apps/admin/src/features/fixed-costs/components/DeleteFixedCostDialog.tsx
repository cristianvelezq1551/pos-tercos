'use client';

import type { FixedCost } from '@pos-tercos/types';
import { ConfirmDialog } from '@pos-tercos/ui';
import { useState } from 'react';
import { deleteFixedCost } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

export function DeleteFixedCostDialog({
  cost,
  onClose,
  onSuccess,
}: {
  cost: FixedCost;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await deleteFixedCost(cost.id);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo eliminar.'));
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      open
      onCancel={onClose}
      onConfirm={handleConfirm}
      title={`Eliminar "${cost.name}"`}
      description={
        error
          ? error
          : 'El costo se borra definitivamente, con todo su historial de pagos. El estado financiero se recalcula al abrirlo, así que los meses viejos dejarían de contarlo y saldrían con mejor resultado del que tuvieron. Si ya tiene pagos registrados no se puede borrar: edítalo y desactívalo, así deja de sumar de aquí en adelante y los meses viejos quedan como están.'
      }
      confirmLabel="Eliminar"
      destructive
      pending={pending}
    />
  );
}
