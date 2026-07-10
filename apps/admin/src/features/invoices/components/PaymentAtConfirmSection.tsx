'use client';

import { FormField, Input } from '@pos-tercos/ui';
import { useEffect, useState, type ChangeEvent } from 'react';
import { PocketPaymentField } from '../../../components/PocketPaymentField';
import { ymdLocalToday } from '../../../lib/dates';
import { getTreasuryAnchorDate } from '../api/client';

/** Estado del pago declarado en la confirmación (lo posee el modal). */
export interface ConfirmPaymentState {
  /** Default true: en el negocio el 95% de las facturas ya están pagadas. */
  enabled: boolean;
  cashAmount: number;
  bankAmount: number;
  /** YYYY-MM-DD, default hoy. */
  paidAt: string;
  note: string;
  proofFile: File | null;
  /** Flujo con foto: usar la foto de la factura como comprobante. */
  useInvoicePhoto: boolean;
}

export function initialConfirmPaymentState(hasInvoicePhoto: boolean): ConfirmPaymentState {
  return {
    enabled: true,
    cashAmount: 0,
    bankAmount: 0,
    paidAt: ymdLocalToday(),
    note: '',
    proofFile: null,
    useInvoicePhoto: hasInvoicePhoto,
  };
}

/**
 * Sección "¿Ya está pagada?" del modal de confirmación. La factura nace
 * PAGADA (default) con bolsillo + comprobante obligatorio, o queda "por
 * pagar" si se destilda (flujo clásico de 2 pasos).
 */
export function PaymentAtConfirmSection({
  state,
  onChange,
  hasInvoicePhoto,
  total,
  disabled,
}: {
  state: ConfirmPaymentState;
  onChange: (next: ConfirmPaymentState) => void;
  hasInvoicePhoto: boolean;
  total: number;
  disabled: boolean;
}) {
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  useEffect(() => {
    void getTreasuryAnchorDate().then(setAnchorDate);
  }, []);

  const set = (patch: Partial<ConfirmPaymentState>): void => onChange({ ...state, ...patch });

  const onFile = (e: ChangeEvent<HTMLInputElement>): void =>
    set({ proofFile: e.target.files?.[0] ?? null });

  const usesInvoicePhoto = hasInvoicePhoto && state.useInvoicePhoto;
  const beforeAnchor = anchorDate !== null && state.paidAt < anchorDate;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          disabled={disabled}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          <span className="text-sm font-semibold text-foreground">Ya está pagada</span>
          <span className="block text-xs text-muted-foreground">
            La factura se registra como PAGADA y descuenta del bolsillo elegido en Tesorería.
            Destildá si quedó pendiente — va a &quot;cuentas por pagar&quot;.
          </span>
        </span>
      </label>

      {state.enabled && (
        <div className="mt-4 space-y-4">
          <PocketPaymentField
            total={total}
            disabled={disabled}
            onChange={(cashAmount, bankAmount) => set({ cashAmount, bankAmount })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Fecha del pago" hint="Por defecto hoy.">
              <Input
                type="date"
                value={state.paidAt}
                onChange={(e) => set({ paidAt: e.target.value })}
                disabled={disabled}
              />
            </FormField>
            <FormField label="Nota (opcional)">
              <Input
                type="text"
                value={state.note}
                onChange={(e) => set({ note: e.target.value })}
                placeholder="Ej. transferencia Bancolombia"
                maxLength={500}
                disabled={disabled}
              />
            </FormField>
          </div>

          {beforeAnchor && (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
              ⚠️ Esta fecha es anterior al corte de Tesorería ({anchorDate}): el pago NO se
              descontará de los bolsillos. Usala solo si realmente se pagó antes del corte.
            </p>
          )}

          {hasInvoicePhoto && (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={state.useInvoicePhoto}
                onChange={(e) => set({ useInvoicePhoto: e.target.checked })}
                disabled={disabled}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="text-sm text-foreground">
                Usar la foto de la factura como comprobante
                <span className="block text-xs text-muted-foreground">
                  Si el pago fue por transferencia, destildá y subí el pantallazo del comprobante.
                </span>
              </span>
            </label>
          )}

          {!usesInvoicePhoto && (
            <FormField
              label="Comprobante del pago"
              required
              hint="Obligatorio. JPEG, PNG o WebP, máx 10 MB."
            >
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFile}
                disabled={disabled}
              />
            </FormField>
          )}
        </div>
      )}
    </section>
  );
}
