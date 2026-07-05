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
