'use client';

import { Button, ConfirmDialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteIngredient } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface Props {
  id: string;
  name: string;
}

/**
 * Botón "Eliminar" para un insumo. Pide confirmación. Si el backend devuelve
 * 409 (insumo con historial), muestra el mensaje guiando a "Desactivar".
 */
export function DeleteIngredientAction({ id, name }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await deleteIngredient(id);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo eliminar el insumo.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-destructive hover:text-destructive"
      >
        Eliminar
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
        title={`Eliminar insumo "${name}"`}
        description={
          error
            ? error
            : 'Esta acción es permanente. Solo se puede eliminar si el insumo nunca fue usado en recetas, movimientos o facturas. Si tiene historial, vas a tener que usar "Desactivar".'
        }
        confirmLabel="Eliminar"
        destructive
        pending={pending}
      />
    </>
  );
}
