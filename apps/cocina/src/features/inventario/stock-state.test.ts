import { describe, expect, it } from 'vitest';
import { portionsToShow, stockState, unregisteredHint } from './stock-state';

describe('stockState', () => {
  it('stock negativo NO es "bajo": es que falta registrar la compra', () => {
    // Regresión: "Pan · −28 unidad" salía con el mismo aviso ámbar "Bajo" que
    // un insumo que se está acabando. El cocinero producía más en vez de contar.
    expect(stockState({ currentStock: -28, lowStock: true })).toBe('unregistered');
    expect(stockState({ currentStock: -28, lowStock: false })).toBe('unregistered');
  });

  it('bajo el mínimo con stock positivo sí es "bajo"', () => {
    expect(stockState({ currentStock: 3, lowStock: true })).toBe('low');
  });

  it('con stock suficiente no avisa nada', () => {
    expect(stockState({ currentStock: 100, lowStock: false })).toBe('ok');
  });

  it('cero es "bajo", no "sin registrar" (se acabó, pero cuadra)', () => {
    expect(stockState({ currentStock: 0, lowStock: true })).toBe('low');
  });
});

describe('portionsToShow', () => {
  it('oculta las porciones cuando el stock es negativo', () => {
    // "−28 porc." no significa nada: no existen porciones negativas.
    expect(portionsToShow({ currentStock: -28, portions: -28 })).toBeNull();
  });

  it('muestra las porciones cuando el número significa algo', () => {
    expect(portionsToShow({ currentStock: 1000, portions: 20 })).toBe(20);
  });

  it('sin porciones configuradas no inventa', () => {
    expect(portionsToShow({ currentStock: 1000, portions: null })).toBeNull();
  });
});

describe('unregisteredHint', () => {
  it('a un subproducto le habla de PRODUCCIÓN, no de compras', () => {
    // Un subproducto no se compra: mandar al cocinero a buscar una factura de
    // "Pollo sazonado" es mandarlo a buscar algo que no existe.
    const hint = unregisteredHint('SUBPRODUCT');
    expect(hint).toContain('producido');
    expect(hint).not.toContain('compra');
  });

  it('a un insumo le habla de la compra que falta', () => {
    expect(unregisteredHint('INGREDIENT')).toContain('compra');
  });

  it('a un producto de reventa también le habla de la compra', () => {
    expect(unregisteredHint('PRODUCT')).toContain('compra');
  });

  it('siempre remata con la acción que el cocinero SÍ puede hacer', () => {
    for (const t of ['INGREDIENT', 'SUBPRODUCT', 'PRODUCT'] as const) {
      expect(unregisteredHint(t)).toContain('Conteo físico');
    }
  });
});
