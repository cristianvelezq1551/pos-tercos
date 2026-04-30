'use client';

import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { openDrawerForSale } from '../api/open-drawer';
import { printReceipt } from '../api/print';
import { openReceiptWindow } from '../lib/open-receipt-window';
import type { LastSaleSummary } from '../store/cart-store';

type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending'; action: 'print' | 'drawer' }
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
  const isCash = sale.paymentMethod === 'CASH';

  const handlePrint = async () => {
    setState({ kind: 'pending', action: 'print' });
    try {
      const { html } = await printReceipt(sale.id);
      const opened = openReceiptWindow(html);
      setState(
        opened
          ? { kind: 'ok', message: 'Recibo abierto en nueva pestaña' }
          : {
              kind: 'error',
              message: 'Pop-up bloqueado. Permití pop-ups para localhost:3002.',
            },
      );
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error imprimiendo',
      });
    }
  };

  const handleOpenDrawer = async () => {
    setState({ kind: 'pending', action: 'drawer' });
    try {
      const r = await openDrawerForSale(sale.id);
      setState({
        kind: 'ok',
        message: `Cajón abierto · ${new Date(r.at).toLocaleTimeString('es-CO')}`,
      });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error abriendo cajón',
      });
    }
  };

  const isPending = state.kind === 'pending';

  return (
    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">✓</span>
        <div className="flex-1">
          <p className="font-semibold">Venta #{sale.receiptNumber} pagada</p>
          <p className="mt-0.5">
            {COP.format(sale.total)} · {sale.paymentMethod}
            {sale.changeDue > 0 ? ` · cambio ${COP.format(sale.changeDue)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ocultar"
          className="ml-1 text-emerald-600 hover:text-emerald-800"
          disabled={isPending}
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={isPending}>
          {state.kind === 'pending' && state.action === 'print'
            ? 'Imprimiendo…'
            : 'Imprimir recibo'}
        </Button>
        {isCash ? (
          <Button size="sm" variant="outline" onClick={handleOpenDrawer} disabled={isPending}>
            {state.kind === 'pending' && state.action === 'drawer'
              ? 'Abriendo…'
              : 'Abrir cajón'}
          </Button>
        ) : null}
      </div>
      {state.kind === 'ok' ? (
        <p className="mt-2 text-[11px] text-emerald-700">{state.message}</p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="mt-2 text-[11px] text-red-700">⚠ {state.message}</p>
      ) : null}
    </div>
  );
}
