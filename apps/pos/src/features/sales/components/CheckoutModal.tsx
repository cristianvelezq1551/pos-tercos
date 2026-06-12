'use client';

import type { Promotion } from '@pos-tercos/types';
import { Button, Dialog, Money, formatCop } from '@pos-tercos/ui';
import { useCheckoutFlow } from '../hooks/useCheckoutFlow';
import type { CartLine } from '../lib/cart-types';
import type { CheckoutSuccess } from '../lib/checkout-confirm';
import type { CartTotalsResult } from '../lib/totals';
import { CheckoutBanners } from './CheckoutBanners';
import { SinglePaymentSection } from './SinglePaymentSection';
import { SplitPaymentSection } from './split/SplitPaymentSection';

export type { CheckoutSuccess } from '../lib/checkout-confirm';

export function CheckoutModal({
  open,
  total,
  items,
  totals,
  promos,
  onClose,
  onSuccess,
}: {
  open: boolean;
  total: number;
  items: readonly CartLine[];
  totals: CartTotalsResult;
  promos: readonly Promotion[];
  onClose: () => void;
  onSuccess: (s: CheckoutSuccess) => void;
}) {
  const {
    offline,
    enabledMethods,
    comandaState,
    method,
    setMethod,
    cashReceived,
    setCashReceived,
    doubleVerified,
    setDoubleVerified,
    isDigital,
    splitOpen,
    toggleSplit,
    handleSplitChange,
    error,
    pending,
    validation,
    handleClose,
    handleConfirm,
  } = useCheckoutFlow({ open, total, items, totals, promos, onClose, onSuccess });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : handleClose}
      title="Cobrar venta"
      description={`Total ${formatCop(total)} · ${items.length} ${
        items.length === 1 ? 'línea' : 'líneas'
      }`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={pending}>
            Cancelar
          </Button>
          <Button size="lg" onClick={handleConfirm} disabled={!validation.ok || pending}>
            {pending ? (
              'Cobrando…'
            ) : (
              <>
                {offline ? 'Cobrar offline' : 'Confirmar'}{' '}
                <Money amount={total} weight="bold" className="ml-1 text-current" />
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <CheckoutBanners offline={offline} comandaState={comandaState} />
        {!offline ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {splitOpen ? 'Cuenta dividida' : 'Pago único'}
            </span>
            <Button
              type="button"
              variant={splitOpen ? 'default' : 'outline'}
              size="sm"
              onClick={toggleSplit}
            >
              {splitOpen ? '← Pago único' : 'Dividir cuenta'}
            </Button>
          </div>
        ) : null}

        {splitOpen ? (
          <SplitPaymentSection
            total={total}
            totals={totals}
            methods={enabledMethods}
            onChange={handleSplitChange}
          />
        ) : (
          <SinglePaymentSection
            total={total}
            methods={enabledMethods}
            method={method}
            isDigital={isDigital}
            cashReceived={cashReceived}
            doubleVerified={doubleVerified}
            onMethod={setMethod}
            onCashReceived={setCashReceived}
            onDoubleVerified={setDoubleVerified}
          />
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!validation.ok && (method || splitOpen) ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {validation.reason}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
