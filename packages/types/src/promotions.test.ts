import { describe, expect, it } from 'vitest';
import { CreatePromotionSchema, UpdatePromotionSchema } from './promotions';

const UUID = '22222222-2222-4222-8222-222222222222';

/** Campos comunes a las 4 variantes; cada test agrega los suyos. */
const base = {
  name: 'Promo test',
  daysOfWeekMask: 127,
  timeStart: '00:00:00',
  timeEnd: '23:59:00',
  productIds: [UUID],
};

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

describe('CreatePromotionSchema — cada tipo solo acepta SUS campos', () => {
  it('PERCENT_OFF exige discountPct', () => {
    const r = CreatePromotionSchema.safeParse({ ...base, type: 'PERCENT_OFF' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/discountPct requerido/);
  });

  it('PERCENT_OFF rechaza campos de otros tipos', () => {
    const r = CreatePromotionSchema.safeParse({
      ...base,
      type: 'PERCENT_OFF',
      discountPct: 0.2,
      discountFixed: 1000,
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/discountFixed/);
  });

  it('PERCENT_OFF válida pasa y toma canal BOTH por defecto', () => {
    const r = CreatePromotionSchema.safeParse({ ...base, type: 'PERCENT_OFF', discountPct: 0.2 });
    expect(r.success).toBe(true);
    expect(r.success && r.data.channel).toBe('BOTH');
  });

  it('FIXED_OFF exige discountFixed y rechaza discountPct', () => {
    expect(CreatePromotionSchema.safeParse({ ...base, type: 'FIXED_OFF' }).success).toBe(false);
    expect(
      CreatePromotionSchema.safeParse({
        ...base,
        type: 'FIXED_OFF',
        discountFixed: 1000,
        discountPct: 0.1,
      }).success,
    ).toBe(false);
    expect(
      CreatePromotionSchema.safeParse({ ...base, type: 'FIXED_OFF', discountFixed: 1000 }).success,
    ).toBe(true);
  });

  it('BOGO exige las DOS cantidades', () => {
    expect(
      CreatePromotionSchema.safeParse({ ...base, type: 'BOGO', bogoBuyQty: 2 }).success,
    ).toBe(false);
    expect(
      CreatePromotionSchema.safeParse({ ...base, type: 'BOGO', bogoGetQty: 1 }).success,
    ).toBe(false);
    expect(
      CreatePromotionSchema.safeParse({
        ...base,
        type: 'BOGO',
        bogoBuyQty: 2,
        bogoGetQty: 1,
      }).success,
    ).toBe(true);
  });

  it('COMBO_OFF acepta descuento porcentual o fijo, no ambos vacíos', () => {
    const conPct = CreatePromotionSchema.safeParse({
      ...base,
      type: 'COMBO_OFF',
      discountPct: 0.15,
    });
    const sinNada = CreatePromotionSchema.safeParse({ ...base, type: 'COMBO_OFF' });
    expect(conPct.success).toBe(true);
    expect(sinNada.success).toBe(false);
  });

  it('exige al menos un producto', () => {
    const r = CreatePromotionSchema.safeParse({
      ...base,
      productIds: [],
      type: 'PERCENT_OFF',
      discountPct: 0.1,
    });
    expect(r.success).toBe(false);
  });

  it('acepta los 3 canales', () => {
    for (const channel of ['BOTH', 'POS', 'WEB'] as const) {
      const r = CreatePromotionSchema.safeParse({
        ...base,
        type: 'PERCENT_OFF',
        discountPct: 0.1,
        channel,
      });
      expect(r.success, channel).toBe(true);
    }
  });
});

describe('UpdatePromotionSchema — los campos por tipo son inmutables', () => {
  it.each(['discountPct', 'discountFixed', 'bogoBuyQty', 'bogoGetQty', 'type'])(
    'el schema es .strict(): mandar %s en un PATCH es un error, no un no-op silencioso',
    (field) => {
      const r = UpdatePromotionSchema.safeParse({ name: 'Nuevo nombre', [field]: 0.5 });
      expect(r.success).toBe(false);
    },
  );

  it('permite cambiar campos meta', () => {
    const r = UpdatePromotionSchema.safeParse({ isActive: false, channel: 'WEB' });
    expect(r.success).toBe(true);
  });
});
