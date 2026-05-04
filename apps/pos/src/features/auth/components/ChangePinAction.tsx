'use client';

import type { User } from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useState } from 'react';
import { setOwnApprovalPin } from '../api/setPin';

const ROLES_WITH_PIN = new Set<User['role']>(['ADMIN_OPERATIVO', 'DUENO']);

export function ChangePinAction({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user || !ROLES_WITH_PIN.has(user.role)) return null;

  const pinValid = /^\d{6}$/.test(pin);
  const matches = pin === confirm;
  const canSubmit = pinValid && matches && !pending;

  const reset = () => {
    setPin('');
    setConfirm('');
    setError(null);
    setSuccess(false);
    setPending(false);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      await setOwnApprovalPin(pin);
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
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
        description="6 dígitos numéricos. Lo usás para autorizar anulaciones, descuentos altos y apertura de cajón sin venta."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newpin">PIN nuevo</Label>
            <Input
              id="newpin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              className="font-mono tracking-widest"
              disabled={pending || success}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmpin">Repetir PIN</Label>
            <Input
              id="confirmpin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              className="font-mono tracking-widest"
              disabled={pending || success}
            />
            {confirm.length > 0 && !matches ? (
              <p className="text-xs text-amber-700">Los PINs no coinciden.</p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              ✓ PIN actualizado.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending || success}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit || success}>
              {pending ? 'Guardando…' : 'Guardar PIN'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
