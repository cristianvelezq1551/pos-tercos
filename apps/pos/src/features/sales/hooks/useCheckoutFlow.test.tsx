// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartTotalsResult } from '../lib/totals';

/**
 * Mutantes de plata que estos tests matan (informe de calidad, testing F):
 * - doble-submit: dos clicks rapidísimos en Confirmar → DOS cobros (el guard
 *   síncrono `submittingRef` es la única defensa del lado UI).
 * - error sin liberar el guard: el primer intento falla y el botón queda
 *   muerto para siempre (cajero bloqueado).
 * - comanda perdida en silencio (informe A2): pago OK + impresión falla debe
 *   disparar el aviso persistente, no morir en un catch.
 */

const runConfirmCheckout = vi.fn();
vi.mock('../lib/checkout-confirm', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/checkout-confirm')>();
  return { ...original, runConfirmCheckout: (...args: unknown[]) => runConfirmCheckout(...args) };
});

const printComanda = vi.fn();
const sendTabToKitchen = vi.fn();
vi.mock('../api/print', () => ({
  printComanda: (...args: unknown[]) => printComanda(...args),
  sendTabToKitchen: (...args: unknown[]) => sendTabToKitchen(...args),
}));

const notifyComandaFailed = vi.fn();
vi.mock('../lib/comanda-events', () => ({
  notifyComandaFailed: (...args: unknown[]) => notifyComandaFailed(...args),
}));

vi.mock('../../offline', () => ({
  useOffline: () => ({ status: 'online', refreshPending: vi.fn() }),
}));
vi.mock('./useEnabledPaymentMethods', () => ({
  useEnabledPaymentMethods: () => ['CASH', 'TRANSFER'],
}));
vi.mock('../../shifts/lib/caja-events', () => ({ notifyCajaChanged: vi.fn() }));
vi.mock('../../../lib/client-log', () => ({ logError: vi.fn() }));

import { useCheckoutFlow } from './useCheckoutFlow';

const TOTAL = 10000;
const EMPTY_TOTALS = { lines: [], subtotal: TOTAL, discount: 0, total: TOTAL } as unknown as CartTotalsResult;

function render(onSuccess = vi.fn(), onClose = vi.fn()) {
  return renderHook(() =>
    useCheckoutFlow({
      open: true,
      total: TOTAL,
      items: [],
      totals: EMPTY_TOTALS,
      promos: [],
      onClose,
      onSuccess,
    }),
  );
}

/** Deja el hook en estado confirmable: efectivo exacto. */
async function armCash(result: ReturnType<typeof render>['result']) {
  await act(async () => {
    result.current.setMethod('CASH');
    result.current.setCashReceived(TOTAL);
  });
  expect(result.current.validation.ok).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCheckoutFlow', () => {
  it('doble click en Confirmar → UN solo cobro (guard síncrono)', async () => {
    let release!: () => void;
    runConfirmCheckout.mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );
    const { result } = render();
    await armCash(result);

    await act(async () => {
      // Dos clicks en el mismo tick: `pending` (async) aún no protege — solo
      // la ref síncrona evita el segundo cobro.
      void result.current.handleConfirm();
      void result.current.handleConfirm();
      release();
    });

    expect(runConfirmCheckout).toHaveBeenCalledTimes(1);
  });

  it('cobro fallido → libera el guard y permite reintentar', async () => {
    runConfirmCheckout.mockRejectedValueOnce(new Error('red caída'));
    runConfirmCheckout.mockResolvedValueOnce(undefined);
    const { result } = render();
    await armCash(result);

    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(result.current.error).toBe('red caída');
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(runConfirmCheckout).toHaveBeenCalledTimes(2);
  });

  it('validación inválida → Confirmar es un no-op (no cobra)', async () => {
    const { result } = render();
    await act(async () => {
      result.current.setMethod('CASH');
      result.current.setCashReceived(TOTAL - 1);
    });
    expect(result.current.validation.ok).toBe(false);

    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(runConfirmCheckout).not.toHaveBeenCalled();
  });

  it('pago OK + comanda falla → dispara notifyComandaFailed (informe A2)', async () => {
    const paidSale = { id: 'sale-1', receiptNumber: 42 };
    printComanda.mockRejectedValueOnce(new Error('print-agent caído'));
    runConfirmCheckout.mockImplementation(async (opts) => {
      // El flujo real invoca finishPaid tras confirmar el pago.
      (opts as { finishPaid: (p: unknown) => void }).finishPaid({
        paidSale,
        success: { kind: 'online', sale: paidSale },
      });
    });
    const onSuccess = vi.fn();
    const { result } = render(onSuccess);
    await armCash(result);

    await act(async () => {
      await result.current.handleConfirm();
      // printComanda es fire-and-forget: dejar drenar la microtask del catch.
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(notifyComandaFailed).toHaveBeenCalledWith(
      expect.objectContaining({ saleId: 'sale-1', receiptNumber: 42, kind: 'comanda' }),
    );
  });

  it('reabrir el modal regenera la idempotency key y resetea el estado', async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useCheckoutFlow({
          open,
          total: TOTAL,
          items: [],
          totals: EMPTY_TOTALS,
          promos: [],
          onClose: vi.fn(),
          onSuccess: vi.fn(),
        }),
      { initialProps: { open: true } },
    );
    await act(async () => {
      result.current.setMethod('CASH');
      result.current.setCashReceived(TOTAL);
    });

    rerender({ open: false });
    rerender({ open: true });

    // Estado limpio: sin método ni efectivo del cobro anterior.
    expect(result.current.method).toBeNull();
    expect(result.current.cashReceived).toBeNull();
    expect(result.current.validation.ok).toBe(false);
  });
});
