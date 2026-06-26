'use client';

import type { Sale } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { cancelSale } from '../api/cancel';
import { createSale } from '../api/create';
import { printComanda } from '../api/print';
import type { CartLine } from '../lib/cart-types';
import { cartLinesToCreateItems } from '../store/cart-store';

export type ComandaState = 'printing' | 'ok' | 'error' | null;

// Al COBRAR (abrir el modal, online): crear la venta YA e imprimir la
// comanda — la cocina arranca sin esperar a que el cliente pague.
export function useCheckoutSale({
  open,
  offline,
  idempotencyKey,
  items,
  onError,
}: {
  open: boolean;
  offline: boolean;
  idempotencyKey: string;
  items: readonly CartLine[];
  onError: (message: string) => void;
}) {
  // Venta creada al ABRIR el modal (Cobrar): dispara la comanda a cocina ya.
  const [sale, setSale] = useState<Sale | null>(null);
  const [comandaState, setComandaState] = useState<ComandaState>(null);

  useEffect(() => {
    if (open) {
      setSale(null);
      setComandaState(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || offline || !idempotencyKey || items.length === 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        const created = await createSale(
          { type: 'COUNTER', items: cartLinesToCreateItems(items) },
          idempotencyKey,
        );
        if (cancelled) {
          // El modal se cerró/reabrió mientras se creaba la venta: handleClose no
          // alcanzó a verla (sale aún era null), así que cancelarla acá para que
          // NO quede colgada en PENDIENTE_PAGO. La comanda no llegó a salir (se
          // imprime más abajo, después de este return).
          void cancelSale(created.id).catch((e) =>
            logError('checkout.orphan-cancel', e, { saleId: created.id }),
          );
          return;
        }
        setSale(created);
        setComandaState('printing');
        try {
          await printComanda(created.id);
          if (!cancelled) setComandaState('ok');
        } catch {
          // Sin print-agent (dev) o impresora caída: la venta sigue normal.
          if (!cancelled) setComandaState('error');
        }
      } catch (err) {
        if (!cancelled) {
          onError(getErrorMessage(err, 'Error creando la venta'));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, offline, idempotencyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sale, comandaState };
}
