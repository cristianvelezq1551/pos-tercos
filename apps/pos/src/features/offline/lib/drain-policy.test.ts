import { describe, expect, it } from 'vitest';
import { backoffMs, MAX_AUTO_SYNC_ATTEMPTS, selectDrainable } from './drain-policy';
import type { OfflineSale } from './types';

function sale(over: Partial<OfflineSale> = {}): OfflineSale {
  return {
    localId: over.localId ?? 'id',
    provisionalNumber: 'OFF-1',
    payload: { lines: [], subtotal: 0, discount: 0, total: 0, customerName: null } as OfflineSale['payload'],
    payment: { method: 'CASH', amountReceived: 0, offlineVerified: false },
    soldOfflineAt: '2026-06-22T10:00:00.000Z',
    status: 'queued',
    ...over,
  };
}

describe('backoffMs', () => {
  it('crece exponencial 5s→15s→45s→2m15s y topa en 5min', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(15_000);
    expect(backoffMs(3)).toBe(45_000);
    expect(backoffMs(4)).toBe(135_000);
    expect(backoffMs(10)).toBe(300_000); // techo
  });

  it('attempts 0 o negativo no rompe (clamp a 5s)', () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(-3)).toBe(5_000);
  });
});

describe('selectDrainable', () => {
  const now = Date.parse('2026-06-22T12:00:00.000Z');

  it('excluye las ya sincronizadas', () => {
    const out = selectDrainable([sale({ localId: 'a', status: 'synced' }), sale({ localId: 'b' })], now);
    expect(out.map((s) => s.localId)).toEqual(['b']);
  });

  it('excluye failed que agotó los intentos (auto), pero la incluye en manual', () => {
    const exhausted = sale({ localId: 'x', status: 'failed', attempts: MAX_AUTO_SYNC_ATTEMPTS });
    expect(selectDrainable([exhausted], now)).toHaveLength(0);
    expect(selectDrainable([exhausted], now, { includeExhausted: true })).toHaveLength(1);
  });

  it('respeta el backoff: una venta reintentada hace 1s con 2 intentos espera', () => {
    const recent = sale({
      localId: 'r',
      status: 'failed',
      attempts: 2, // backoff 15s
      lastAttemptAt: new Date(now - 1_000).toISOString(),
    });
    expect(selectDrainable([recent], now)).toHaveLength(0); // 1s < 15s
    // pasados 20s desde el último intento → ya es elegible
    expect(selectDrainable([recent], now + 20_000)).toHaveLength(1);
  });

  it('el reintento manual ignora cota y backoff', () => {
    const recent = sale({
      localId: 'r',
      status: 'failed',
      attempts: MAX_AUTO_SYNC_ATTEMPTS,
      lastAttemptAt: new Date(now).toISOString(),
    });
    expect(selectDrainable([recent], now, { includeExhausted: true })).toHaveLength(1);
  });

  it('ordena FIFO por hora de venta', () => {
    const late = sale({ localId: 'late', soldOfflineAt: '2026-06-22T11:00:00.000Z' });
    const early = sale({ localId: 'early', soldOfflineAt: '2026-06-22T09:00:00.000Z' });
    const out = selectDrainable([late, early], now);
    expect(out.map((s) => s.localId)).toEqual(['early', 'late']);
  });
});
