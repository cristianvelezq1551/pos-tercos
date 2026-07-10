// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfflineSale } from '../lib/types';

/**
 * La bandeja offline es el último recurso cuando una venta cobrada sin red no
 * sincroniza: si una venta fallida DESAPARECE de la lista o se descarta sin
 * confirmación, la plata del cajón queda sin registro y nadie se entera.
 */

const listUnsynced = vi.fn();
const deleteSale = vi.fn();
vi.mock('../lib/db', () => ({
  offlineDb: {
    listUnsynced: (...a: unknown[]) => listUnsynced(...a),
    deleteSale: (...a: unknown[]) => deleteSale(...a),
  },
}));
const drainOfflineQueue = vi.fn();
vi.mock('../lib/sync-engine', () => ({
  drainOfflineQueue: (...a: unknown[]) => drainOfflineQueue(...a),
}));

import { OfflineReviewTray } from './OfflineReviewTray';

function offlineSale(over: Partial<OfflineSale>): OfflineSale {
  return {
    localId: 'l1',
    provisionalNumber: 'OFF-1',
    status: 'failed',
    attempts: 5,
    failReason: 'Stock insuficiente',
    soldOfflineAt: '2026-07-06T12:00:00.000Z',
    payload: { total: 12000 },
    payment: { method: 'CASH' },
    ...over,
  } as unknown as OfflineSale;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OfflineReviewTray', () => {
  it('una venta fallida (reintentos agotados) SIGUE visible con su motivo', async () => {
    listUnsynced.mockResolvedValue([offlineSale({})]);
    render(<OfflineReviewTray open onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText(/OFF-1/)).toBeDefined();
    expect(screen.getByText('Falló')).toBeDefined();
    expect(screen.getByText('Stock insuficiente')).toBeDefined();
  });

  it('el reintento manual incluye las agotadas (includeExhausted)', async () => {
    listUnsynced.mockResolvedValue([offlineSale({})]);
    drainOfflineQueue.mockResolvedValue(undefined);
    render(<OfflineReviewTray open onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText(/OFF-1/);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar sincronización' }));
    await waitFor(() =>
      expect(drainOfflineQueue).toHaveBeenCalledWith(expect.any(Function), {
        includeExhausted: true,
      }),
    );
  });

  it('descartar exige confirmación explícita (nunca borra al primer click)', async () => {
    listUnsynced.mockResolvedValue([offlineSale({})]);
    deleteSale.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<OfflineReviewTray open onClose={vi.fn()} onChanged={onChanged} />);
    await screen.findByText(/OFF-1/);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar (último recurso)' }));
    expect(deleteSale).not.toHaveBeenCalled();
    // La advertencia del descuadre es parte del contrato con el cajero.
    expect(screen.getByText(/NO se registrará/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    await waitFor(() => expect(deleteSale).toHaveBeenCalledWith('l1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('sin cola → estado vacío y reintento deshabilitado', async () => {
    listUnsynced.mockResolvedValue([]);
    render(<OfflineReviewTray open onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText(/todo sincronizado/)).toBeDefined();
    const retry = screen.getByRole('button', { name: 'Reintentar sincronización' });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
  });
});
