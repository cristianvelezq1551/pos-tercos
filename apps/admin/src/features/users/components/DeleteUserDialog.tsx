'use client';

import type { ManagedUser } from '@pos-tercos/types';
import { Button, Dialog, PinField, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { deleteUser } from '../api/client';

interface DeleteUserDialogProps {
  user: Pick<ManagedUser, 'id' | 'fullName' | 'email'>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Elimina DEFINITIVAMENTE un usuario. Solo procede si no tiene historial
 * operativo; si lo tiene, el backend responde con un mensaje guiando a
 * "Terminar empleo" (que inactiva y conserva el historial).
 */
export function DeleteUserDialog({ user, onClose, onSuccess }: DeleteUserDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await deleteUser(user.id, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el usuario.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Eliminar usuario"
      description={`${user.fullName} · ${user.email}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !isValidPin(pin)}>
            {pending ? 'Eliminando…' : 'Eliminar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Esta acción es <strong>permanente</strong> y no se puede deshacer.
        </p>
        <p className="text-xs text-muted-foreground">
          Solo se puede eliminar a alguien <strong>sin historial</strong> (creado por error o que nunca
          operó). Si ya hizo ventas o turnos, el sistema no lo dejará: en ese caso usa{' '}
          <strong>Terminar empleo</strong>, que lo inactiva y conserva su historial.
        </p>
        <PinField value={pin} onChange={setPin} disabled={pending} />
        {error ? (
          <p role="alert" className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
