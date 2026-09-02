import { describe, expect, it } from 'vitest';
import { derivarLinea } from './derivar-linea';

const linea = (over: Partial<Parameters<typeof derivarLinea>[0]> = {}) => ({
  quantity: 0,
  unitPrice: 0,
  total: 0,
  ...over,
});

describe('escribiendo dos, el tercero sale solo', () => {
  it('cantidad × unitario da el total', () => {
    const r = derivarLinea(linea({ quantity: 5.2 }), 'unitario', 10000);
    expect(r.total).toBe(52000);
  });

  // El caso que pidió el dueño: el bulto trae 5,2 kg y el papel dice el total.
  it('total ÷ cantidad da el unitario', () => {
    const r = derivarLinea(linea({ quantity: 5.2 }), 'total', 52000);
    expect(r.unitPrice).toBe(10000);
  });

  it('el unitario admite decimales cuando la división no es exacta', () => {
    const r = derivarLinea(linea({ quantity: 3 }), 'total', 50000);
    expect(r.unitPrice).toBe(16666.67);
  });

  it('el total se redondea a pesos', () => {
    const r = derivarLinea(linea({ quantity: 3 }), 'unitario', 16666.67);
    expect(r.total).toBe(50000);
  });
});

describe('al cambiar la cantidad se recalcula lo DERIVADO, no lo escrito', () => {
  // El total es lo que dice el papel: corregir la cantidad no puede cambiarlo.
  it('si escribió el total, la cantidad ajusta el unitario', () => {
    const conTotal = derivarLinea(linea({ quantity: 5 }), 'total', 52000);
    const r = derivarLinea(conTotal, 'cantidad', 5.2);
    expect(r.total).toBe(52000);
    expect(r.unitPrice).toBe(10000);
  });

  it('si escribió el unitario, la cantidad ajusta el total', () => {
    const conUnitario = derivarLinea(linea({ quantity: 1 }), 'unitario', 10000);
    const r = derivarLinea(conUnitario, 'cantidad', 5.2);
    expect(r.unitPrice).toBe(10000);
    expect(r.total).toBe(52000);
  });

  it('sin nada escrito todavía, manda el unitario', () => {
    const r = derivarLinea(linea({ unitPrice: 2000 }), 'cantidad', 4);
    expect(r.total).toBe(8000);
  });

  // Una fila que ya trae total viene de la factura: ese total es lo que se pagó
  // y lo que usa el costeo. Corregir la cantidad mal leída no puede pisarlo.
  it('en una fila que llegó de la IA, corregir la cantidad ajusta el unitario', () => {
    const deLaIA = linea({ quantity: 1, unitPrice: 52000, total: 52000 });
    const r = derivarLinea(deLaIA, 'cantidad', 5.2);
    expect(r.total).toBe(52000);
    expect(r.unitPrice).toBe(10000);
  });
});

describe('bordes', () => {
  it('cantidad 0 no divide entre cero: deja el unitario como estaba', () => {
    const r = derivarLinea(linea({ quantity: 0, unitPrice: 999 }), 'total', 5000);
    expect(r.unitPrice).toBe(999);
    expect(r.total).toBe(5000);
  });

  it('borrar la cantidad no borra los importes', () => {
    const previo = derivarLinea(linea({ quantity: 2 }), 'unitario', 1000);
    const r = derivarLinea(previo, 'cantidad', 0);
    expect(r.total).toBe(2000);
  });
});
