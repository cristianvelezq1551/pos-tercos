'use client';

import { Button, ConfirmDialog } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteSubproduct } from '../api/client';

interface Props {
  id: string;
  name: string;
}

export function DeleteSubproductAction({ id, name }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await deleteSubproduct(id);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el subproducto.');
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
        title={`Eliminar subproducto "${name}"`}
        description={
          error
            ? error
            : 'Esta acción es permanente. Solo se puede eliminar si el subproducto no se usa en la receta de otro producto o subproducto. Si está en uso, vas a tener que usar "Desactivar".'
        }
        confirmLabel="Eliminar"
        destructive
        pending={pending}
      />
    </>
  );
}
