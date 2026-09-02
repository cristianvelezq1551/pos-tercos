// @vitest-environment jsdom
import type { InventoryMovement, Stockable } from '@pos-tercos/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MovementsList } from './MovementsList';
import { StockList } from './StockList';

const STOCK: Stockable[] = [
  {
    type: 'INGREDIENT',
    id: 'a',
    name: 'Pan brioche',
    category: null,
    currentStock: 30,
    unitStock: 'unidad',
    unitPurchase: 'paquete',
    conversionFactor: 12,
    thresholdMin: 20,
    portionSize: null,
    lowStock: false,
    isActive: true,
    blocksAvailability: true,
  },
  {
    type: 'PRODUCT',
    id: 'b',
    name: 'Coca-Cola 400ml',
    category: 'Bebidas',
    currentStock: 12,
    unitStock: 'unidad',
    unitPurchase: 'caja',
    conversionFactor: 24,
    thresholdMin: 6,
    portionSize: null,
    lowStock: false,
    isActive: true,
    blocksAvailability: true,
  },
];

function movimiento(over: Partial<InventoryMovement>): InventoryMovement {
  return {
    id: 'm1',
    entityType: 'INGREDIENT',
    ingredientId: 'a',
    productId: null,
    subproductId: null,
    itemName: 'Pan brioche',
    type: 'WASTE',
    delta: -5,
    unitCost: null,
    sourceType: null,
    sourceId: null,
    notes: 'Se cayó la bandeja',
    evidenceUrl: null,
    userId: null,
    userFullName: 'Rony',
    idempotencyKey: null,
    createdAt: '2026-09-01T15:00:00.000Z',
    ...over,
  };
}

describe('buscador de existencias', () => {
  it('filtra por nombre y por categoría', () => {
    render(<StockList rows={STOCK} />);
    const campo = screen.getByLabelText('Buscar existencias por nombre o categoría');

    fireEvent.change(campo, { target: { value: 'pan' } });
    expect(screen.queryByText('Coca-Cola 400ml')).toBeNull();

    fireEvent.change(campo, { target: { value: 'bebidas' } });
    expect(screen.getByText('Coca-Cola 400ml')).toBeDefined();
    expect(screen.queryByText('Pan brioche')).toBeNull();
  });

  it('sin coincidencias no dice que el inventario está vacío', () => {
    render(<StockList rows={STOCK} />);
    fireEvent.change(screen.getByLabelText('Buscar existencias por nombre o categoría'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('Ningún ítem coincide')).toBeDefined();
    expect(screen.queryByText('No hay productos con inventario')).toBeNull();
  });
});

describe('buscador de movimientos', () => {
  const FILAS = [
    movimiento({ id: 'm1', notes: 'Se cayó la bandeja' }),
    movimiento({
      id: 'm2',
      itemName: 'Repollo',
      ingredientId: 'c',
      type: 'MANUAL_ADJUSTMENT',
      delta: 3,
      notes: 'Conteo del lunes',
      userFullName: 'Carolina',
    }),
  ];

  it('busca por ítem, por nota y por persona', () => {
    render(<MovementsList rows={FILAS} />);
    const campo = screen.getByLabelText('Buscar movimientos por ítem, nota o persona');

    fireEvent.change(campo, { target: { value: 'repollo' } });
    expect(screen.getByText('Repollo')).toBeDefined();
    expect(screen.queryByText('Pan brioche')).toBeNull();

    fireEvent.change(campo, { target: { value: 'bandeja' } });
    expect(screen.getByText('Pan brioche')).toBeDefined();

    fireEvent.change(campo, { target: { value: 'carolina' } });
    expect(screen.getByText('Repollo')).toBeDefined();
    expect(screen.queryByText('Pan brioche')).toBeNull();
  });

  // El contador tiene que decir sobre cuántas busca: la página trae las
  // últimas 200, no toda la historia.
  it('dice que busca sobre lo cargado', () => {
    render(<MovementsList rows={FILAS} />);
    expect(screen.getByText('2 movimientos cargados')).toBeDefined();
  });

  // Si la reversa queda fuera del filtro, la merma volvería a ofrecer "Anular"
  // y se devolvería el stock dos veces.
  it('no reabre una merma ya devuelta aunque su reversa no coincida con la búsqueda', () => {
    const merma = movimiento({ id: 'w1', itemName: 'Pan brioche', delta: -5, notes: 'derrame' });
    const reversa = movimiento({
      id: 'w2',
      itemName: 'Pan brioche',
      type: 'MANUAL_ADJUSTMENT',
      delta: 5,
      sourceType: 'waste_reversal',
      sourceId: 'w1',
      notes: 'me equivoqué de cantidad',
    });
    render(<MovementsList rows={[merma, reversa]} />);
    fireEvent.change(screen.getByLabelText('Buscar movimientos por ítem, nota o persona'), {
      target: { value: 'derrame' },
    });
    expect(screen.queryByRole('button', { name: /anular/i })).toBeNull();
  });
});
