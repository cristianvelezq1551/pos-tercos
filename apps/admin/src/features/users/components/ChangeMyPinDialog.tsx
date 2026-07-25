'use client';

import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useState } from 'react';
import { setOwnApprovalPin } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface ChangeMyPinDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

/** Autoservicio: el usuario logueado cambia SU PROPIO PIN de aprobación. */
export function ChangeMyPinDialog({ onClose, onSuccess }: ChangeMyPinDialogProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  const mismatch = confirm.length > 0 && pin !== confirm;
  const valid = /^\d{6}$/.test(pin) && pin === confirm && password.length > 0;

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await setOwnApprovalPin(pin, password);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el PIN.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cambiar mi PIN de aprobación"
      description="Tu PIN autoriza acciones sensibles (anular ventas, nómina, abrir el cajón sin venta). Solo vos puedes cambiarlo."
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending ? 'Guardando…' : 'Guardar PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nuevo PIN (6 dígitos)" required>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            disabled={pending}
            placeholder="● ● ● ● ● ●"
          />
        </FormField>
        <FormField label="Confirmar PIN" required error={mismatch ? 'Los PIN no coinciden.' : undefined}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(onlyDigits(e.target.value))}
            disabled={pending}
            placeholder="● ● ● ● ● ●"
          />
        </FormField>
        <FormField label="Tu contraseña" required hint="Confirma con tu clave para evitar cambios desde una sesión abierta.">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            placeholder="Tu contraseña"
          />
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
