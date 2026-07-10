'use client';

import type { PaymentMethod } from '@pos-tercos/types';
import { FormField } from '@pos-tercos/ui';
import { CashSection } from './CashSection';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { TransferSection } from './TransferSection';

export function SinglePaymentSection({
  total,
  methods,
  method,
  isDigital,
  cashReceived,
  doubleVerified,
  onMethod,
  onCashReceived,
  onDoubleVerified,
}: {
  total: number;
  methods: readonly PaymentMethod[];
  method: PaymentMethod | null;
  isDigital: boolean;
  cashReceived: number | null;
  doubleVerified: boolean;
  onMethod: (method: PaymentMethod) => void;
  onCashReceived: (v: number | null) => void;
  onDoubleVerified: (v: boolean) => void;
}) {
  return (
    <>
      <FormField label="Método de pago">
        <PaymentMethodSelector methods={methods} selected={method} onSelect={onMethod} />
      </FormField>

      {method === 'CASH' ? (
        <CashSection total={total} cashReceived={cashReceived} onChange={onCashReceived} />
      ) : null}

      {isDigital ? (
        <TransferSection total={total} verified={doubleVerified} onVerified={onDoubleVerified} />
      ) : null}
    </>
  );
}
