'use client';

import { FormField, Input, MoneyInput, Select, formatCop } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';

type PayMode = 'CUENTA' | 'EFECTIVO' | 'MIXTO';

/**
 * Selector de bolsillo de pago: Cuenta (default) / Efectivo / Mixto. Reporta el
 * reparto cashAmount/bankAmount (suman `total`) vía `onChange`. Reutilizado por
 * los diálogos de "marcar pagado" (facturas, costos fijos, nómina).
 */
export function PocketPaymentField({
  total,
  disabled,
  onChange,
}: {
  total: number;
  disabled?: boolean;
  onChange: (cashAmount: number, bankAmount: number) => void;
}) {
  const [mode, setMode] = useState<PayMode>('CUENTA');
  const [cashInput, setCashInput] = useState('');

  const cashAmount =
    mode === 'EFECTIVO' ? total : mode === 'CUENTA' ? 0 : Math.min(Number(cashInput) || 0, total);
  const bankAmount = Math.round((total - cashAmount) * 100) / 100;

  // Ref para no re-disparar el efecto cuando el padre pasa un onChange inline.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(cashAmount, bankAmount);
  }, [cashAmount, bankAmount]);

  return (
    <div className="space-y-3">
      <FormField label="¿De qué bolsillo salió?" required>
        <Select value={mode} onChange={(e) => setMode(e.target.value as PayMode)} disabled={disabled}>
          <option value="CUENTA">Cuenta (transferencia/QR)</option>
          <option value="EFECTIVO">Efectivo</option>
          <option value="MIXTO">Mixto (parte efectivo, parte cuenta)</option>
        </Select>
      </FormField>
      {mode === 'MIXTO' ? (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Efectivo">
            <MoneyInput value={cashInput} onChange={setCashInput} disabled={disabled} placeholder="0" />
          </FormField>
          <FormField label="Cuenta (resto)">
            <Input value={formatCop(bankAmount)} readOnly disabled className="bg-muted/40" />
          </FormField>
        </div>
      ) : null}
    </div>
  );
}
