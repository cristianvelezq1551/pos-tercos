import { describe, it, expect } from 'vitest';
import { renderComandaEscPos } from './render-comanda';
import type { ComandaData } from './render-comanda';

const BASE: ComandaData = {
  receiptNumber: 42,
  createdAt: '2026-05-04T15:30:00.000Z',
  type: 'COUNTER',
  customerName: null,
  items: [
    { productName: 'Burger Nashville', sizeName: null, quantity: 2, modifiers: ['Tocineta'], notes: 'sin cebolla' },
  ],
  reprintLabel: null,
};

const text = (buf: Buffer): string => buf.toString('latin1');

describe('renderComandaEscPos', () => {
  it('comienza con ESC @ (init) y termina con GS V (cut)', () => {
    const out = renderComandaEscPos(BASE);
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
    const last = out.slice(out.length - 3);
    expect([last[0], last[1], last[2]]).toEqual([0x1d, 0x56, 0x01]);
  });

  it('imprime "PEDIDO #<recibo>" (ya no "TURNO"), encabezado de comanda e ítems', () => {
    const out = text(renderComandaEscPos(BASE));
    expect(out).toContain('COMANDA COCINA');
    expect(out).toContain('PEDIDO #42');
    expect(out).not.toContain('TURNO');
    expect(out).toContain('2x Burger Nashville');
    expect(out).toContain('+ Tocineta');
    expect(out).toContain('* sin cebolla');
  });

  it('marca los pedidos WEB con la etiqueta "PEDIDO WEB"', () => {
    const out = text(renderComandaEscPos({ ...BASE, type: 'WEB_PICKUP', customerName: 'Ana' }));
    expect(out).toContain('PEDIDO WEB');
    expect(out).toContain('Cliente: Ana');
  });

  it('un ticket de ANULACIÓN grita DESCARTAR el pedido', () => {
    const out = text(renderComandaEscPos({ ...BASE, cancelled: true }));
    expect(out).toContain('ANULAR');
    expect(out).toContain('DESCARTAR ESTE PEDIDO');
  });

  it('incluye el reprintLabel cuando se reimprime', () => {
    const out = text(renderComandaEscPos({ ...BASE, reprintLabel: 'REIMPRESIÓN' }));
    expect(out).toContain('REIMPRESIÓN');
  });

  it('imprime el pie del negocio + margen de corte al final', () => {
    const out = text(renderComandaEscPos({ ...BASE, footer: 'TERCOS ENVIGADO' }));
    expect(out).toContain('TERCOS ENVIGADO');
    // margen de papel en blanco antes del corte (cortar a mano sin dañar el pedido)
    expect(out).toMatch(/\n{6}/);
  });

  it('cae a "TERCOS" si no se pasa footer', () => {
    const out = text(renderComandaEscPos(BASE));
    expect(out).toContain('TERCOS');
  });
});

describe('renderComandaEscPos — domicilio', () => {
  const DELIVERY: ComandaData = {
    ...BASE,
    type: 'WEB_DELIVERY',
    customerName: 'Ana',
    customerPhone: '+573001112233',
    deliveryAddress: 'Cra 43A #5-15, torre 2, apto 502',
    deliveryNotes: 'Portería azul, el timbre no suena',
  };

  it('grita DOMICILIO y imprime a dónde va', () => {
    const out = text(renderComandaEscPos(DELIVERY));
    expect(out).toContain('*** DOMICILIO ***');
    expect(out).toContain('ENTREGAR EN:');
    expect(out).toContain('Cra 43A #5-15, torre 2,');
    expect(out).toContain('apto 502');
    expect(out).toContain('Portería azul');
    expect(out).toContain('Tel: +573001112233');
  });

  it('la dirección se PARTE, no se trunca: el apto no se puede perder', () => {
    const largo = 'Calle 100 Sur #45-32 Este, conjunto Los Robles, torre 7, apartamento 1204';
    const out = text(renderComandaEscPos({ ...DELIVERY, deliveryAddress: largo }));
    // Truncar a 32 se comería justo el apartamento, que es lo único que
    // importa cuando el repartidor ya llegó al edificio.
    expect(out).toContain('apartamento 1204');
    expect(out).not.toContain('…');
    // Y ninguna línea de la dirección se pasa del ancho del papel (32).
    for (const line of largo.split(/\s+/)) expect(line.length).toBeLessThanOrEqual(32);
  });

  it('un pedido para recoger NO imprime dirección', () => {
    const out = text(renderComandaEscPos({ ...BASE, type: 'WEB_PICKUP' }));
    expect(out).toContain('PEDIDO WEB');
    expect(out).not.toContain('DOMICILIO');
    expect(out).not.toContain('ENTREGAR EN:');
  });

  it('una venta de mostrador no lleva nada de esto', () => {
    const out = text(renderComandaEscPos(BASE));
    expect(out).not.toContain('DOMICILIO');
    expect(out).not.toContain('ENTREGAR EN:');
  });
});

describe('comanda de CORTESÍA', () => {
  it('dice CORTESÍA en vez de un número de pedido que no existe', () => {
    const t = renderComandaEscPos({
      ...BASE,
      receiptNumber: null,
      title: 'CORTESÍA',
    }).toString('latin1');
    expect(t).toContain('CORTESÍA');
    expect(t).not.toContain('PEDIDO #');
    expect(t).not.toContain('null');
  });

  it('un pedido cobrado sigue mostrando su número', () => {
    expect(renderComandaEscPos(BASE).toString('latin1')).toContain('PEDIDO #42');
  });
});
