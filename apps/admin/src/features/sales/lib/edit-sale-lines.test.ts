import { describe, expect, it } from 'vitest';
import type { Sale, SaleItem } from '@pos-tercos/types';
import type { PickerSelection } from '../../catalog';
import { saleItemsToEditLines, selectionToEditLine } from './edit-sale-lines';

/**
 * La regla de cocina es de negocio, no cosmética: si el pedido ya se está
 * preparando, cambiar una línea de PREPARACIÓN descuadra lo que salió por la
 * comanda contra lo que se cobra. Solo la reventa directa (bebidas) se edita.
 */

const item = (over: Partial<SaleItem> = {}): SaleItem =>
  ({
    productId: 'burger',
    productName: 'Hamburguesa',
    sizeId: null,
    sizeName: null,
    quantity: 1,
    modifiers: [],
    notes: null,
    unitPrice: 20_000,
    manualDiscount: null,
    ...over,
  }) as SaleItem;

const saleWith = (status: string, items: SaleItem[]): Sale =>
  ({ status, items }) as unknown as Sale;

/** burger = preparado, coke = reventa directa. */
const resale = new Map([
  ['burger', false],
  ['coke', true],
]);

describe('saleItemsToEditLines — candado de cocina', () => {
  it('en PAGADO todo es editable (la cocina todavía no lo tomó)', () => {
    const lines = saleItemsToEditLines(
      saleWith('PAGADO', [item(), item({ productId: 'coke' })]),
      resale,
    );
    expect(lines.map((l) => l.locked)).toEqual([false, false]);
  });

  it.each(['EN_PREPARACION', 'LISTO_DESPACHO'])(
    'en %s bloquea la preparación y deja libre la reventa',
    (status) => {
      const lines = saleItemsToEditLines(
        saleWith(status, [item(), item({ productId: 'coke', productName: 'Coca-Cola' })]),
        resale,
      );
      expect(lines[0].locked).toBe(true);
      expect(lines[1].locked).toBe(false);
    },
  );

  it('un producto desconocido en el mapa se trata como preparación (bloqueado)', () => {
    const lines = saleItemsToEditLines(
      saleWith('EN_PREPARACION', [item({ productId: 'fantasma' })]),
      resale,
    );
    expect(lines[0].locked).toBe(true);
  });

  it('un estado ajeno al flujo de cocina no bloquea nada', () => {
    const lines = saleItemsToEditLines(saleWith('PENDIENTE_PAGO', [item()]), resale);
    expect(lines[0].locked).toBe(false);
  });
});

describe('saleItemsToEditLines — proyección de la línea', () => {
  it('conserva cantidad, precio, tamaño, notas y descuento manual', () => {
    const [line] = saleItemsToEditLines(
      saleWith('PAGADO', [
        item({
          quantity: 3,
          unitPrice: 18_500,
          sizeId: 'size-1',
          sizeName: 'Grande',
          notes: 'sin cebolla',
          manualDiscount: { kind: 'FIXED', value: 1000 },
        }),
      ]),
      resale,
    );
    expect(line).toMatchObject({
      quantity: 3,
      unitPrice: 18_500,
      sizeId: 'size-1',
      sizeName: 'Grande',
      notes: 'sin cebolla',
      manualDiscount: { kind: 'FIXED', value: 1000 },
    });
  });

  it('aplana los modificadores a ids + nombres paralelos', () => {
    const [line] = saleItemsToEditLines(
      saleWith('PAGADO', [
        item({
          modifiers: [
            { modifierId: 'm1', name: 'Extra queso', priceDelta: 2000 },
            { modifierId: 'm2', name: 'Sin tomate', priceDelta: 0 },
          ],
        }),
      ]),
      resale,
    );
    expect(line.modifierIds).toEqual(['m1', 'm2']);
    expect(line.modifierNames).toEqual(['Extra queso', 'Sin tomate']);
  });

  it('cae a un nombre legible si el backend no mandó productName', () => {
    const [line] = saleItemsToEditLines(
      saleWith('PAGADO', [item({ productName: undefined })]),
      resale,
    );
    expect(line.productName).toBe('Producto');
  });

  it('una venta sin ítems devuelve lista vacía (no revienta)', () => {
    expect(saleItemsToEditLines({ status: 'PAGADO' } as unknown as Sale, resale)).toEqual([]);
  });
});

describe('selectionToEditLine — línea agregada desde el picker', () => {
  it('nace desbloqueada aunque la cocina ya haya iniciado el pedido', () => {
    const line = selectionToEditLine({
      productId: 'coke',
      productName: 'Coca-Cola',
      size: null,
      modifiers: [],
      quantity: 2,
      unitPrice: 4000,
      isCombo: false,
    });
    expect(line.locked).toBe(false);
    expect(line.manualDiscount).toBeNull();
    expect(line.quantity).toBe(2);
  });

  it('mapea tamaño y modificadores de la selección', () => {
    const line = selectionToEditLine({
      productId: 'burger',
      productName: 'Hamburguesa',
      size: { id: 's1', name: 'Doble' } as PickerSelection['size'],
      modifiers: [{ id: 'm1', name: 'Extra queso' }] as PickerSelection['modifiers'],
      quantity: 1,
      unitPrice: 26_000,
      isCombo: false,
    });
    expect(line).toMatchObject({
      sizeId: 's1',
      sizeName: 'Doble',
      modifierIds: ['m1'],
      modifierNames: ['Extra queso'],
    });
  });
});
