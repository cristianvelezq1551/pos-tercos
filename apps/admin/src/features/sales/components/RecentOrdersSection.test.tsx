// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { CortesiaRequest, Sale } from '@pos-tercos/types';
import { describe, expect, it, vi } from 'vitest';

/**
 * «Últimos pedidos» del panel de venta: el cajero mira ACÁ para saber qué salió
 * hoy. Una cortesía es un pedido que la cocina preparó, así que va en la misma
 * lista, rotulada, con el valor tachado (no entró plata) y **se abre igual que
 * un pedido cobrado**. Mutantes que estos tests matan: volver a listar solo
 * ventas, o dejar la cortesía como una fila muerta que no responde al tap.
 */

import { mergeDayEntries } from '../lib/day-entries';
import { RecentOrdersSection } from './RecentOrdersSection';

const sale = {
  id: 'sale-1',
  receiptNumber: 27,
  status: 'PAGADO',
  total: 25000,
  customerName: 'camilo',
  createdAt: '2026-07-30T13:44:00.000Z',
} as unknown as Sale;

const gift = {
  id: 'cort-1',
  status: 'APPROVED',
  productName: 'Hamburguesa sencilla',
  quantity: 1,
  reason: 'influencer',
  salePrice: 25000,
  createdAt: '2026-07-30T13:45:00.000Z',
} as unknown as CortesiaRequest;

describe('RecentOrdersSection', () => {
  it('lista la cortesía junto a los pedidos cobrados', () => {
    render(
      <RecentOrdersSection
        entries={mergeDayEntries([sale], [gift])}
        onSelectSale={vi.fn()}
        onSelectCortesia={vi.fn()}
      />,
    );

    expect(screen.getByText('Cortesía')).toBeDefined();
    expect(screen.getByText(/1× Hamburguesa sencilla/)).toBeDefined();
    expect(screen.getByText(/#27/)).toBeDefined();
  });

  it('tocar la cortesía abre su detalle; tocar la venta, el de la venta', () => {
    const onSelectSale = vi.fn();
    const onSelectCortesia = vi.fn();
    render(
      <RecentOrdersSection
        entries={mergeDayEntries([sale], [gift])}
        onSelectSale={onSelectSale}
        onSelectCortesia={onSelectCortesia}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Hamburguesa sencilla/ }));
    expect(onSelectCortesia).toHaveBeenCalledWith(gift);

    fireEvent.click(screen.getByRole('button', { name: /#27/ }));
    expect(onSelectSale).toHaveBeenCalledWith(sale);
  });

  it('sin nada del día lo dice explícito', () => {
    render(<RecentOrdersSection entries={[]} onSelectSale={vi.fn()} onSelectCortesia={vi.fn()} />);
    expect(screen.getByText('Todavía no hay pedidos hoy.')).toBeDefined();
  });
});
