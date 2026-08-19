'use client';

import type { ManagedUser } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useState } from 'react';
import { resetUserPassword } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface ResetPasswordDialogProps {
  user: ManagedUser;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResetPasswordDialog({ user, onClose, onSuccess }: ResetPasswordDialogProps) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const mismatch = confirm.length > 0 && pwd !== confirm;
  const valid = pwd.length >= 8 && pwd === confirm;

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await resetUserPassword(user.id, pwd);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo resetear la contraseña.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Resetear contraseña"
      description={`${user.fullName} deberá cambiarla en su próximo ingreso y se cerrarán sus sesiones.`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending ? 'Guardando…' : 'Resetear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
          <Input type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} disabled={pending} />
        </FormField>
        <FormField
          label="Confirmar contraseña"
          required
          error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
        >
          <Input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
