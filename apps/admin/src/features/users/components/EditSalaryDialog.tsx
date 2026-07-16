'use client';

import type { ManagedUser, PayType } from '@pos-tercos/types';
import { Button, Checkbox, Dialog, FormField, Input, MoneyInput, Select } from '@pos-tercos/ui';
import { useState } from 'react';
import { setEmployment } from '../api/client';

interface EditSalaryDialogProps {
  user: Pick<ManagedUser, 'id' | 'fullName' | 'payType' | 'salaryAmount' | 'hireDate'> & {
    restDaysOfWeek?: number[];
  };
  onClose: () => void;
  onSuccess: (u: ManagedUser) => void;
}

/** Lunes (1) = descanso del negocio SIEMPRE (no abrimos lunes salvo festivo); se
 *  fuerza en restDaysOfWeek y no es togglable. Aquí solo Mar…Dom. */
const MONDAY = 1;
const DOW_LABELS: Array<{ value: number; label: string }> = [
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

/** Editar tipo de pago + salario + días de descanso. Requiere PIN del Dueño. */
export function EditSalaryDialog({ user, onClose, onSuccess }: EditSalaryDialogProps) {
  const [payType, setPayType] = useState<PayType>(user.payType ?? 'MONTHLY');
  const [salary, setSalary] = useState(user.salaryAmount != null ? String(user.salaryAmount) : '');
  const [hireDate, setHireDate] = useState(user.hireDate ? user.hireDate.slice(0, 10) : '');
  // El lunes se fuerza al guardar; el estado editable solo lleva Mar…Dom.
  const [restDays, setRestDays] = useState<Set<number>>(
    new Set((user.restDaysOfWeek ?? []).filter((d) => d !== MONDAY)),
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggleRest = (dow: number): void => {
    setRestDays((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow);
      else next.add(dow);
      return next;
    });
  };

  // Lunes forzado + los días marcados. 7 = descansaría toda la semana → inválido.
  const effectiveRest = new Set<number>([MONDAY, ...restDays]);
  const allRest = effectiveRest.size >= 7;
  const valid = /^\d{6}$/.test(pin) && Number(salary) > 0 && !allRest;

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const updated = await setEmployment(
        user.id,
        {
          payType,
          salaryAmount: Number(salary),
          hireDate: hireDate || null,
          restDaysOfWeek: Array.from(effectiveRest).sort((a, b) => a - b),
        },
        pin,
      );
      onSuccess(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el salario.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar salario y descansos"
      description={`${user.fullName} · este cambio queda registrado en bitácora.`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending ? 'Guardando…' : 'Guardar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Tipo de pago">
          <Select value={payType} onChange={(e) => setPayType(e.target.value as PayType)} disabled={pending}>
            <option value="MONTHLY">Mensual (salario fijo al mes)</option>
            <option value="DAILY">Diario (valor fijo al día)</option>
          </Select>
        </FormField>
        <FormField label={payType === 'MONTHLY' ? 'Salario mensual' : 'Valor por día'}>
          <MoneyInput value={salary} onChange={setSalary} disabled={pending} placeholder="0" />
        </FormField>
        <FormField label="Fecha de vinculación" hint="Afecta la proración del primer/último pago.">
          <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={pending} />
        </FormField>

        <FormField
          label="Días de descanso (no pagos)"
          hint={
            payType === 'DAILY'
              ? 'Solo aplica a DIARIO. El lunes ya es descanso fijo (no abrimos). Ej. trabajador de fin de semana → marcá martes-jueves.'
              : 'Solo aplica a DIARIO; el salario mensual se paga independiente del día.'
          }
        >
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              El lunes siempre es descanso (el negocio no abre) y no se cuenta en la nómina.
            </p>
            <div className="flex flex-wrap gap-2">
              {DOW_LABELS.map((d) => (
                <Checkbox
                  key={d.value}
                  checked={restDays.has(d.value)}
                  onChange={() => toggleRest(d.value)}
                  label={d.label}
                  disabled={pending || payType !== 'DAILY'}
                />
              ))}
            </div>
            {allRest ? (
              <p className="mt-1 text-xs text-destructive">No se pueden marcar los 7 días como descanso.</p>
            ) : null}
          </div>
        </FormField>

        <FormField label="PIN de aprobación (Dueño)" required error={pin && !/^\d{6}$/.test(pin) ? '6 dígitos' : undefined}>
          <Input
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={pending}
            placeholder="● ● ● ● ● ●"
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
