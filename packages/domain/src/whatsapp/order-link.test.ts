import { describe, expect, it } from 'vitest';
import { buildWebOrderLink } from './order-link';

const BASE = {
  businessPhone: '+573207615261',
  receiptNumber: 108,
  customerName: 'Ana',
  items: [
    { productName: 'Hamburguesa pollo', quantity: 2, modifiers: ['Tocineta'], notes: 'sin cebolla' },
    { productName: 'Coca-Cola', sizeName: '400ml', quantity: 1 },
  ],
  total: 59000,
};

describe('buildWebOrderLink', () => {
  it('arma el link a wa.me del negocio con el mensaje encodeado', () => {
    const link = buildWebOrderLink(BASE)!;
    expect(link.url.startsWith('https://wa.me/573207615261?text=')).toBe(true);
    // El texto plano queda legible (auditoría); el URL va encodeado.
    expect(link.messagePlain).toContain('pedido #108');
    expect(link.url).not.toContain(' ');
  });

  it('lleva el pedido completo: ítems, adiciones, notas y total', () => {
    const { messagePlain } = buildWebOrderLink(BASE)!;
    expect(messagePlain).toContain('2x Hamburguesa pollo');
    expect(messagePlain).toContain('+ Tocineta');
    expect(messagePlain).toContain('* sin cebolla');
    expect(messagePlain).toContain('1x Coca-Cola (400ml)');
    expect(messagePlain).toContain('Total: $59.000');
  });

  it('el número de pedido va SIEMPRE: es lo que ata el chat a la venta', () => {
    const { messagePlain } = buildWebOrderLink({ ...BASE, customerName: null })!;
    expect(messagePlain).toContain('#108');
  });

  it('un domicilio lleva la dirección y las referencias', () => {
    const { messagePlain } = buildWebOrderLink({
      ...BASE,
      deliveryAddress: 'Cra 43A #5-15, torre 2, apto 502',
      deliveryNotes: 'Portería azul',
    })!;
    expect(messagePlain).toContain('A domicilio');
    expect(messagePlain).toContain('Dirección: Cra 43A #5-15, torre 2, apto 502');
    expect(messagePlain).toContain('Referencias: Portería azul');
  });

  it('sin dirección dice que lo recoge en el local', () => {
    const { messagePlain } = buildWebOrderLink(BASE)!;
    expect(messagePlain).toContain('Paso a recogerlo al local');
    expect(messagePlain).not.toContain('Dirección:');
  });

  it('sin teléfono del negocio devuelve null (la web oculta el botón)', () => {
    expect(buildWebOrderLink({ ...BASE, businessPhone: null })).toBeNull();
    expect(buildWebOrderLink({ ...BASE, businessPhone: '' })).toBeNull();
    expect(buildWebOrderLink({ ...BASE, businessPhone: '123' })).toBeNull();
  });

  it('normaliza el teléfono venga como venga', () => {
    for (const phone of ['+57 320 761 5261', '573207615261', '3207615261']) {
      expect(buildWebOrderLink({ ...BASE, businessPhone: phone })!.url).toContain(
        'wa.me/573207615261',
      );
    }
  });
});

describe('buildWebOrderLink — el envío todavía no se sabe', () => {
  it('en domicilio NO dice "Total": el envío falta y el local lo cotiza', () => {
    const { messagePlain } = buildWebOrderLink({
      ...BASE,
      deliveryAddress: 'Cra 43A #5-15, apto 502',
    })!;
    // "Total: $59.000" sería mentira: falta el domicilio.
    expect(messagePlain).toContain('Pedido: $59.000');
    expect(messagePlain).not.toContain('Total:');
    expect(messagePlain).toContain('¿Cuánto sale el domicilio?');
  });

  it('para recoger el total SÍ es final', () => {
    const { messagePlain } = buildWebOrderLink(BASE)!;
    expect(messagePlain).toContain('Total: $59.000');
    expect(messagePlain).not.toContain('domicilio');
  });
});
