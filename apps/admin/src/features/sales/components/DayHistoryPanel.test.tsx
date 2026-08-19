// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CortesiaRequest, Sale } from '@pos-tercos/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Una cortesía es un pedido que la cocina preparó y el negocio NO cobró: tiene
 * que estar en el historial del día, junto a los cobrados y rotulada como tal
 * (antes solo vivía en una pestaña aparte y el cajero la perdía de vista).
 * Mutantes que estos tests matan: dejar de leer las cortesías, mostrarlas como
 * si fueran una venta cobrada, o colarlas en los filtros por estado de venta.
 */

const listSales = vi.fn();
vi.mock('../api/list', () => ({ listSales: (...a: unknown[]) => listSales(...a) }));
const listDayCortesias = vi.fn();
vi.mock('../../caja-cortesias', async () => {
  const mod = await import('../../caja-cortesias/components/CortesiaHistoryRow');
  return {
    CortesiaHistoryRow: mod.CortesiaHistoryRow,
    listDayCortesias: (...a: unknown[]) => listDayCortesias(...a),
    useUnseenCortesias: () => 0,
  };
});
vi.mock('../api/print', () => ({ printReceipt: vi.fn(), printComanda: vi.fn() }));
vi.mock('../hooks/useFacturaPrint', () => ({
  useFacturaPrint: () => ({ requestFactura: vi.fn(), facturaModal: null }),
}));
vi.mock('../../../lib/client-log', () => ({ logError: vi.fn() }));

import { DayHistoryPanel } from './DayHistoryPanel';

function sale(over: Partial<Sale>): Sale {
  return {
    id: 'sale-1',
    receiptNumber: 27,
    status: 'PAGADO',
    total: 25000,
    customerName: 'camilo',
    createdAt: '2026-07-30T13:44:00.000Z',
    paidAt: '2026-07-30T13:44:30.000Z',
    paymentMethod: 'CASH',
    items: [],
    ...over,
  } as unknown as Sale;
}

function cortesia(over: Partial<CortesiaRequest> = {}): CortesiaRequest {
  return {
    id: 'cort-1',
    status: 'APPROVED',
    saleId: null,
    productId: 'p1',
    productName: 'Hamburguesa sencilla',
    sizeId: null,
    sizeName: null,
    quantity: 1,
    reason: 'influencer',
    costAmount: 4925,
    salePrice: 25000,
    requestedById: 'u1',
    requestedByName: 'Victor',
    resolvedById: 'u1',
    resolvedByName: 'Victor',
    resolvedAt: '2026-07-30T13:44:31.845Z',
    resolverNote: null,
    seenByRequester: true,
    createdAt: '2026-07-30T13:44:31.846Z',
    ...over,
  } as unknown as CortesiaRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  listSales.mockResolvedValue([sale({})]);
  listDayCortesias.mockResolvedValue([cortesia()]);
});

describe('DayHistoryPanel', () => {
  it('muestra la cortesía en «Todos», rotulada y con el valor regalado', async () => {
    render(<DayHistoryPanel active />);

    expect(await screen.findByText('Cortesía')).toBeDefined();
    expect(screen.getByText(/1× Hamburguesa sencilla/)).toBeDefined();
    expect(screen.getByText(/regalado/)).toBeDefined();
    expect(screen.getByText(/influencer/)).toBeDefined();
    // Y sigue mostrando el pedido cobrado: es UNA sola lista.
    expect(screen.getByText('#27')).toBeDefined();
  });

  it('tocar la cortesía abre su detalle (mismo gesto que un pedido cobrado)', async () => {
    render(<DayHistoryPanel active />);
    await screen.findByText('Cortesía');

    fireEvent.click(screen.getByRole('button', { name: /Hamburguesa sencilla/ }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Lo que salió')).toBeDefined();
    expect(screen.getByText('Valor regalado')).toBeDefined();
  });

  it('el contador de «Todos» cuenta la cortesía como un pedido más', async () => {
    render(<DayHistoryPanel active />);
    await screen.findByText('Cortesía');

    const todos = screen.getByRole('button', { name: /Todos/ });
    expect(todos.textContent).toContain('2');
  });

  it('los filtros por estado de venta NO muestran cortesías', async () => {
    render(<DayHistoryPanel active />);
    await screen.findByText('Cortesía');

    fireEvent.click(screen.getByRole('button', { name: /Pagados/ }));
    expect(screen.getByText('#27')).toBeDefined();
    expect(screen.queryByText('Cortesía')).toBeNull();
  });

  it('la pestaña Cortesías muestra solo las cortesías del día', async () => {
    render(<DayHistoryPanel active />);
    await screen.findByText('Cortesía');

    fireEvent.click(screen.getByRole('button', { name: /Cortesías/ }));
    expect(screen.getByText('Cortesía')).toBeDefined();
    expect(screen.queryByText('#27')).toBeNull();
    // Y la pestaña activa es una sola: «Todos» deja de verse seleccionado.
    expect(screen.getByRole('button', { name: /Cortesías/ }).className).toContain('border-primary');
    expect(screen.getByRole('button', { name: /Todos/ }).className).not.toContain('border-primary');
  });

  it('una cortesía recién registrada aparece sin recargar', async () => {
    listDayCortesias.mockResolvedValue([]);
    render(<DayHistoryPanel active />);
    await screen.findByText('#27');
    expect(screen.queryByText('Cortesía')).toBeNull();

    // Lo que dispara el cajero al regalar el pedido (mismo evento que un cobro).
    listDayCortesias.mockResolvedValue([cortesia()]);
    await act(async () => {
      window.dispatchEvent(new Event('pos:orders-changed'));
    });

    expect(await screen.findByText('Cortesía')).toBeDefined();
  });

  it('si la lectura de cortesías falla, el historial de ventas se muestra igual', async () => {
    listDayCortesias.mockRejectedValue(new Error('sin red'));
    render(<DayHistoryPanel active />);

    expect(await screen.findByText('#27')).toBeDefined();
    expect(screen.queryByText('Cortesía')).toBeNull();
  });
});
