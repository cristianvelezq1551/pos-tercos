'use client';

import { Button, IconButton, Money } from '@pos-tercos/ui';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { printReceipt } from '../api/print';
import { openReceiptWindow } from '../lib/open-receipt-window';
import type { LastSaleSummary } from '../store/cart-store';

type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export function LastSaleBanner({
  sale,
  onDismiss,
}: {
  sale: LastSaleSummary;
  onDismiss: () => void;
}) {
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const handlePrint = async () => {
    setState({ kind: 'pending' });
    try {
      const { html } = await printReceipt(sale.id);
      openReceiptWindow(html);
      setState({ kind: 'ok', message: 'Diálogo de impresión abierto' });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error imprimiendo',
      });
    }
  };

  const isPending = state.kind === 'pending';

  return (
    <div className="mt-3 rounded-xl border border-success-border bg-success-bg px-3 py-2.5 text-xs text-success">
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold text-foreground">Venta #{sale.receiptNumber} pagada</p>
          <p className="mt-0.5 text-muted-foreground">
            <Money amount={sale.total} size="xs" weight="medium" className="text-current" /> ·{' '}
            {sale.paymentMethod}
            {sale.changeDue > 0 ? (
              <>
                {' '}
                · cambio{' '}
                <Money amount={sale.changeDue} size="xs" weight="medium" className="text-current" />
              </>
            ) : null}
          </p>
        </div>
        <IconButton
          aria-label="Ocultar"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          disabled={isPending}
          className="-mr-1 -mt-1 text-success hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="mt-2">
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={isPending}>
          {isPending ? 'Imprimiendo…' : 'Imprimir recibo'}
        </Button>
      </div>
      {state.kind === 'ok' ? (
        <p className="mt-2 text-[11px] text-success">{state.message}</p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="mt-2 text-[11px] text-destructive">{state.message}</p>
      ) : null}
    </div>
  );
}
