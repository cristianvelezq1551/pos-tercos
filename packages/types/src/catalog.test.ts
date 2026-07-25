import { describe, expect, it } from 'vitest';
import { CreateProductSchema, UpdateProductSchema } from './catalog';

/**
 * Las reglas de producto que este schema fija tienen consecuencias de plata e
 * inventario: un combo sin precio se cobraría a $0; un producto de reventa sin
 * factor de conversión descuenta mal el stock; reventa + combo a la vez rompe
 * el cálculo de consumo (no se sabe qué descontar).
 */

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

// La categoría es obligatoria al crear (ver CreateProductSchema): va en el
// fixture para que cada test hable de lo suyo y no de esto.
const base = { name: 'Tercos Burger', basePrice: 20_000, category: 'Burgers' };

describe('CreateProductSchema — combos', () => {
  it('un combo exige comboPrice (si no, se cobraría $0)', () => {
    const r = CreateProductSchema.safeParse({ ...base, isCombo: true });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/Un combo necesita un precio de combo/);
  });

  it('comboPrice en un producto normal se rechaza (dato huérfano)', () => {
    const r = CreateProductSchema.safeParse({ ...base, comboPrice: 30_000 });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/Solo los combos llevan precio de combo/);
  });

  it('comboPrice null explícito tampoco alcanza para un combo', () => {
    expect(
      CreateProductSchema.safeParse({ ...base, isCombo: true, comboPrice: null }).success,
    ).toBe(false);
  });

  it('un combo con precio pasa', () => {
    expect(
      CreateProductSchema.safeParse({ ...base, isCombo: true, comboPrice: 30_000 }).success,
    ).toBe(true);
  });
});

describe('CreateProductSchema — reventa directa', () => {
  const resale = { ...base, directResale: true };

  it.each([
    ['unitPurchase', /Falta la unidad de compra/],
    ['unitStock', /Falta la unidad de venta/],
    ['conversionFactor', /Falta el factor de conversión/],
  ] as const)('exige %s', (missing, esperado) => {
    const full = {
      ...resale,
      unitPurchase: 'caja',
      unitStock: 'unidad',
      conversionFactor: 24,
    } as Record<string, unknown>;
    delete full[missing];
    const r = CreateProductSchema.safeParse(full);
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(esperado);
    // El campo culpable sigue viajando en `path` para que el form lo resalte.
    expect(r.error!.issues.some((i) => i.path.includes(missing))).toBe(true);
  });

  it('con los 3 campos pasa', () => {
    expect(
      CreateProductSchema.safeParse({
        ...resale,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 24,
      }).success,
    ).toBe(true);
  });

  it('reventa directa y combo son EXCLUYENTES', () => {
    const r = CreateProductSchema.safeParse({
      ...resale,
      unitPurchase: 'caja',
      unitStock: 'unidad',
      conversionFactor: 24,
      isCombo: true,
      comboPrice: 30_000,
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/no puede ser de reventa directa y combo a la vez/);
  });

  it('rechaza factor de conversión 0 o negativo (dividiría por cero al costear)', () => {
    for (const conversionFactor of [0, -1]) {
      const r = CreateProductSchema.safeParse({
        ...resale,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor,
      });
      expect(r.success, String(conversionFactor)).toBe(false);
    }
  });

  it('un producto normal no necesita nada de reventa', () => {
    expect(CreateProductSchema.safeParse(base).success).toBe(true);
  });
});

describe('CreateProductSchema — categoría obligatoria', () => {
  // Todo el catálogo se navega por categoría: sin ella el producto solo
  // aparece bajo "Todo" y no lo encuentra ni el cajero ni el cliente.
  it.each([
    ['ausente', {}],
    ['vacía', { category: '' }],
    ['solo espacios', { category: '   ' }],
    ['null', { category: null }],
  ])('rechaza al crear con la categoría %s', (_caso, patch) => {
    const { category: _drop, ...sinCategoria } = base;
    expect(CreateProductSchema.safeParse({ ...sinCategoria, ...patch }).success).toBe(false);
  });

  it('acepta una categoría con nombre', () => {
    expect(CreateProductSchema.safeParse(base).success).toBe(true);
  });

  it('al EDITAR sigue siendo opcional: hay productos viejos sin categoría y\n     cambiarles el precio no puede obligar a clasificarlos primero', () => {
    expect(UpdateProductSchema.safeParse({ basePrice: 25_000 }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ category: null }).success).toBe(true);
  });
});

describe('CreateProductSchema — campos básicos', () => {
  it('rechaza precio negativo pero acepta 0 (producto de cortesía)', () => {
    expect(CreateProductSchema.safeParse({ ...base, basePrice: -1 }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...base, basePrice: 0 }).success).toBe(true);
  });

  it('exige nombre no vacío', () => {
    expect(CreateProductSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('acepta imageUrl absoluta o path relativo, y rechaza el resto', () => {
    const url = (imageUrl: string) => CreateProductSchema.safeParse({ ...base, imageUrl }).success;
    expect(url('https://cdn.tercos.co/burger.png')).toBe(true);
    expect(url('/uploads/burger.png')).toBe(true);
    expect(url('')).toBe(true);
    expect(url('javascript:alert(1)')).toBe(false);
    expect(url('burger.png')).toBe(false);
  });

  it('acepta emoji compuesto (los ZWJ ocupan varios code units)', () => {
    expect(CreateProductSchema.safeParse({ ...base, emoji: '👨‍🍳' }).success).toBe(true);
  });
});
