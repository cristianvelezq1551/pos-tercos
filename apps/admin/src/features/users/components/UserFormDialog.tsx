'use client';

import type { ManagedUser, PayType, UserRole } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, MoneyInput, Select } from '@pos-tercos/ui';
import { useState } from 'react';
import { createUser, updateUser } from '../api/client';
import { ROLE_OPTIONS, PIN_ROLES } from '../lib/roles';
import { getErrorMessage } from '../../../lib/errors';

interface UserFormDialogProps {
  open: boolean;
  /** Si viene, es edición; si no, creación. */
  user: ManagedUser | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function UserFormDialog({ open, user, onClose, onSuccess }: UserFormDialogProps) {
  const isEdit = user !== null;
  const isPrimaryOwner = user?.isPrimaryOwner ?? false;
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  // El operador de caja es ADMIN_OPERATIVO (el rol CAJERO se retiró de la
  // operación en el cutover POS→admin; ver roles.ts).
  const [role, setRole] = useState<UserRole>(user?.role ?? 'ADMIN_OPERATIVO');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(user?.active ?? true);
  const [hireDate, setHireDate] = useState(user?.hireDate ? user.hireDate.slice(0, 10) : '');
  const [payType, setPayType] = useState<'' | PayType>(user?.payType ?? '');
  const [salary, setSalary] = useState(user?.salaryAmount != null ? String(user.salaryAmount) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      if (isEdit) {
        // El salario/empleo se edita en el panel de nómina (con PIN).
        await updateUser(user.id, {
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          role,
          active,
        });
      } else {
        await createUser({
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          role,
          password,
          ...(pin && PIN_ROLES.includes(role) ? { pin } : {}),
          hireDate: hireDate || null,
          payType: payType || null,
          salaryAmount: payType && salary ? Number(salary) : null,
        });
      }
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el usuario.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
      description={isEdit ? user.email : 'Crea un empleado y asignale su rol.'}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre completo" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pending} />
        </FormField>

        {!isEdit && (
          <FormField label="Correo (usuario para ingresar)" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="empleado@tercos.co"
            />
          </FormField>
        )}

        <FormField label="Teléfono" hint="Opcional">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
        </FormField>

        <FormField
          label="Rol"
          required
          hint={isPrimaryOwner ? 'El dueño principal no puede cambiar de rol.' : undefined}
        >
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={pending || isPrimaryOwner}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        {isEdit ? (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            El <strong>salario y el tipo de pago</strong> se editan en{' '}
            <strong>Nómina</strong> (requiere PIN del Dueño y queda en bitácora).
          </p>
        ) : (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Empleo (para la nómina) — opcional
            </p>
            <FormField label="Tipo de pago">
              <Select value={payType} onChange={(e) => setPayType(e.target.value as '' | PayType)} disabled={pending}>
                <option value="">Sin nómina</option>
                <option value="MONTHLY">Mensual — salario fijo al mes</option>
                <option value="DAILY">Diario — valor por día trabajado</option>
              </Select>
            </FormField>

            {payType ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Fecha de vinculación">
                    <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={pending} />
                  </FormField>
                  <FormField label={payType === 'DAILY' ? 'Valor por día' : 'Salario mensual'}>
                    <MoneyInput value={salary} onChange={setSalary} disabled={pending} placeholder="0" />
                  </FormField>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se paga en 4 pagos por mes (2 quincenas × 2 sub-pagos).{' '}
                  {payType === 'MONTHLY'
                    ? 'Cada pago = salario ÷ 4 (constante). Un mes completo suma exacto el salario.'
                    : 'Se suman los días trabajados de cada pago. Los días de descanso cíclicos no se pagan — los editás después en el perfil del empleado.'}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Elige Mensual o Diario para incluir al empleado en la nómina.
              </p>
            )}
          </div>
        )}

        {!isEdit && (
          <FormField
            label="Contraseña inicial"
            required
            hint="Mínimo 8 caracteres. El empleado deberá cambiarla en su primer ingreso."
          >
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              placeholder="mínimo 8 caracteres"
            />
          </FormField>
        )}

        {!isEdit && PIN_ROLES.includes(role) && (
          <FormField
            label="PIN de aprobación (opcional)"
            hint="6 dígitos. Necesario para anular ventas o abrir el cajón sin venta. Puedes configurarlo después."
          >
            <Input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              disabled={pending}
              placeholder="● ● ● ● ● ●"
            />
          </FormField>
        )}

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={pending || isPrimaryOwner}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            Usuario activo (puede iniciar sesión)
            {isPrimaryOwner ? (
              <span className="text-xs text-muted-foreground">· el dueño principal no se desactiva</span>
            ) : null}
          </label>
        )}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
