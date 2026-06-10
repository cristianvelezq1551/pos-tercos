'use client';

import type { FixedCost } from '@pos-tercos/types';
import { ConfirmDialog } from '@pos-tercos/ui';
import { useState } from 'react';
import { deleteFixedCost } from '../api/client';

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
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
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
          : 'El costo se borra definitivamente. Esto NO afecta cierres anteriores ya calculados, pero deja de sumar a partir del próximo cálculo. Si solo querés pausarlo, edítalo y desactivalo.'
      }
      confirmLabel="Eliminar"
      destructive
      pending={pending}
    />
  );
}
