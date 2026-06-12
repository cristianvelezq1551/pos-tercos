'use client';

import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethodSetting,
} from '@pos-tercos/types';
import { Button, LoadingSkeleton } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listAllPaymentMethods, updatePaymentMethods } from '../api/client';

const HINTS: Record<string, string> = {
  CASH: 'Billetes y monedas. Abre el cajón y entra al arqueo de efectivo.',
  CARD: 'Datáfono. El cajero verifica el voucher antes de confirmar.',
  TRANSFER: 'Transferencia bancaria. Verificación de comprobante + arqueo digital.',
  NEQUI: 'Verificación de comprobante + reconciliación con el CSV de Nequi.',
  DAVIPLATA: 'Verificación de comprobante + reconciliación CSV.',
  QR_BANCOLOMBIA: 'QR del banco. Verificación de comprobante + reconciliación CSV.',
};

/** Habilitar/deshabilitar los métodos que el POS ofrece al cobrar. */
export function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethodSetting[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAllPaymentMethods()
      .then(setMethods)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error cargando'));
  }, []);

  const toggle = async (m: PaymentMethodSetting) => {
    setPending(m.method);
    setError(null);
    try {
      const next = await updatePaymentMethods({
        methods: [{ method: m.method, enabled: !m.enabled }],
      });
      setMethods(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setPending(null);
    }
  };

  if (error && !methods) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!methods) return <LoadingSkeleton shape="text" count={6} />;

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {methods.map((m) => (
            <li key={m.method} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {PAYMENT_METHOD_LABELS[m.method]}
                  {m.enabled ? (
                    <span className="ml-2 rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-xs font-semibold text-success">
                      activo en el POS
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{HINTS[m.method] ?? ''}</p>
              </div>
              <Button
                variant={m.enabled ? 'outline' : 'default'}
                size="sm"
                onClick={() => toggle(m)}
                disabled={pending !== null}
              >
                {pending === m.method ? '…' : m.enabled ? 'Deshabilitar' : 'Habilitar'}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Los métodos deshabilitados desaparecen del cobro en el POS (incluida la cuenta
        dividida) y el backend rechaza cualquier cobro que los use. Sin conexión, el POS
        cobra con Efectivo y Transferencia.
      </p>
    </div>
  );
}
