// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks de las dependencias del hook (mismas rutas relativas que useCheckoutSale).
vi.mock('../api/create', () => ({ createSale: vi.fn() }));
vi.mock('../api/print', () => ({ printComanda: vi.fn() }));
vi.mock('../api/cancel', () => ({ cancelSale: vi.fn() }));
vi.mock('../store/cart-store', () => ({ cartLinesToCreateItems: vi.fn(() => [{ productId: 'p1', quantity: 1 }]) }));

import { createSale } from '../api/create';
import { cancelSale } from '../api/cancel';
import { printComanda } from '../api/print';
import { useCheckoutSale } from './useCheckoutSale';

const FAKE_SALE = { id: 'sale-1' } as never;
const items = [{ productId: 'p1' }] as never;

describe('useCheckoutSale', () => {
  beforeEach(() => {
    vi.mocked(createSale).mockReset();
    vi.mocked(cancelSale).mockReset().mockResolvedValue(undefined);
    vi.mocked(printComanda).mockReset().mockResolvedValue({} as never);
  });
  afterEach(() => vi.clearAllMocks());

  it('al abrir crea la venta e imprime la comanda (online)', async () => {
    vi.mocked(createSale).mockResolvedValue(FAKE_SALE);
    const { result } = renderHook(() =>
      useCheckoutSale({ open: true, offline: false, idempotencyKey: 'k1', items, onError: vi.fn() }),
    );
    await waitFor(() => expect(result.current.sale).toEqual(FAKE_SALE));
    expect(createSale).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.comandaState).toBe('ok'));
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it('offline NO crea la venta (la creación es online)', () => {
    renderHook(() =>
      useCheckoutSale({ open: true, offline: true, idempotencyKey: 'k1', items, onError: vi.fn() }),
    );
    expect(createSale).not.toHaveBeenCalled();
  });

  it('CRÍTICO: si la venta se crea TRAS el cleanup, la cancela (no queda huérfana)', async () => {
    // createSale resuelve DESPUÉS de desmontar → el flag `cancelled` ya está en true.
    let resolveCreate!: (s: typeof FAKE_SALE) => void;
    vi.mocked(createSale).mockReturnValue(new Promise((r) => (resolveCreate = r)));

    const { unmount } = renderHook(() =>
      useCheckoutSale({ open: true, offline: false, idempotencyKey: 'k1', items, onError: vi.fn() }),
    );
    // El effect ya disparó createSale (pendiente). Desmontamos → cleanup.
    expect(createSale).toHaveBeenCalledTimes(1);
    unmount();
    // Ahora la venta "llega tarde": debe cancelarse, no quedar colgada en PENDIENTE_PAGO.
    resolveCreate(FAKE_SALE);
    await waitFor(() => expect(cancelSale).toHaveBeenCalledWith('sale-1'));
    // Y NO se imprime la comanda de una venta que ya se va a cancelar.
    expect(printComanda).not.toHaveBeenCalled();
  });
});
