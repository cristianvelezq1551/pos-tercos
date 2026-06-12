'use client';

import type { User } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input } from '@pos-tercos/ui';
import { useState } from 'react';
import { setOwnApprovalPin } from '../api/setPin';
import { getErrorMessage } from '../../../lib/errors';

const ROLES_WITH_PIN = new Set<User['role']>(['ADMIN_OPERATIVO', 'DUENO']);

export function ChangePinAction({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user || !ROLES_WITH_PIN.has(user.role)) return null;

  const pinValid = /^\d{6}$/.test(pin);
  const matches = pin === confirm;
  const canSubmit = pinValid && matches && password.length > 0 && !pending;

  const reset = () => {
    setPin('');
    setConfirm('');
    setPassword('');
    setError(null);
    setSuccess(false);
    setPending(false);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      await setOwnApprovalPin(pin, password);
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1200);
    } catch (err) {
      setError(getErrorMessage(err, 'Error'));
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Cambiar PIN
      </Button>
      <Dialog
        open={open}
        onClose={pending ? () => {} : () => setOpen(false)}
        title="Cambiar mi PIN de aprobaciones"
        description="6 dígitos numéricos. Lo usas para autorizar anulaciones, descuentos altos y apertura de cajón sin venta."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending || success}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit || success}>
              {pending ? 'Guardando…' : 'Guardar PIN'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="PIN nuevo">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              className="font-mono tracking-[0.4em]"
              disabled={pending || success}
              autoFocus
            />
          </FormField>
          <FormField
            label="Repetir PIN"
            error={confirm.length > 0 && !matches ? 'Los PINs no coinciden.' : undefined}
          >
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              className="font-mono tracking-[0.4em]"
              disabled={pending || success}
            />
          </FormField>
          <FormField label="Tu contraseña">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              disabled={pending || success}
            />
          </FormField>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p
              role="status"
              className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success"
            >
              PIN actualizado.
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
