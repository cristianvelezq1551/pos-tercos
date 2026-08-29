import { describe, expect, it } from 'vitest';
import { applyPromotion } from './apply-promotions';
import { promotionScheduleState } from './schedule-state';
import type { PromotionDef, PromotionSchedule } from './types';

const ALL_DAYS = 127;
const NO_THURSDAY = 119; // 0b1110111

function schedule(over: Partial<PromotionSchedule> = {}): PromotionSchedule {
  return {
    daysOfWeekMask: ALL_DAYS,
    timeStart: '00:00:00',
    timeEnd: '23:59:00',
    activeFrom: null,
    activeTo: null,
    ...over,
  };
}

/** 2026-08-27 es jueves; 2026-08-28, viernes. */
const JUEVES = (h = 13, m = 0) => new Date(2026, 7, 27, h, m);
const VIERNES = (h = 13, m = 0) => new Date(2026, 7, 28, h, m);

describe('promotionScheduleState', () => {
  it('aplica cuando el día, la hora y la vigencia dan', () => {
    const r = promotionScheduleState(schedule(), VIERNES());
    expect(r).toEqual({ appliesNow: true, reason: 'applies', nextStart: null });
  });

  it('distingue "hoy no es su día" de "está inactiva"', () => {
    // El caso de prod (2026-08-27): promo activa, vigente y de todo el día,
    // pero con el jueves apagado en la máscara.
    const s = schedule({
      daysOfWeekMask: NO_THURSDAY,
      activeFrom: '2026-08-27',
      activeTo: '2026-08-28',
    });
    const r = promotionScheduleState(s, JUEVES());
    expect(r.appliesNow).toBe(false);
    expect(r.reason).toBe('day_off');
    // Vuelve el viernes al arrancar la franja.
    expect(r.nextStart).toEqual(new Date(2026, 7, 28, 0, 0, 0));
  });

  it('la vigencia que todavía no empezó devuelve el día en que arranca', () => {
    const s = schedule({ activeFrom: '2026-08-28', timeStart: '17:00:00', timeEnd: '23:00:00' });
    const r = promotionScheduleState(s, JUEVES());
    expect(r.reason).toBe('not_started');
    expect(r.nextStart).toEqual(new Date(2026, 7, 28, 17, 0, 0));
  });

  it('vencida no vuelve nunca', () => {
    const s = schedule({ activeTo: '2026-08-27' });
    const r = promotionScheduleState(s, VIERNES());
    expect(r.reason).toBe('expired');
    expect(r.nextStart).toBeNull();
  });

  it('fuera de la franja del mismo día apunta al arranque de mañana', () => {
    const s = schedule({ timeStart: '17:00:00', timeEnd: '23:00:00' });
    const r = promotionScheduleState(s, VIERNES(9));
    expect(r.reason).toBe('outside_hours');
    expect(r.nextStart).toEqual(new Date(2026, 7, 28, 17, 0, 0));
  });

  it('ya pasada la franja de hoy, el próximo arranque es mañana', () => {
    const s = schedule({ timeStart: '17:00:00', timeEnd: '23:00:00' });
    const r = promotionScheduleState(s, VIERNES(23, 30));
    expect(r.reason).toBe('outside_hours');
    expect(r.nextStart).toEqual(new Date(2026, 7, 29, 17, 0, 0));
  });

  it('un solo día de la semana salta a la semana siguiente', () => {
    const s = schedule({ daysOfWeekMask: 1 }); // solo lunes
    const r = promotionScheduleState(s, VIERNES());
    expect(r.reason).toBe('day_off');
    expect(r.nextStart).toEqual(new Date(2026, 7, 31, 0, 0, 0)); // lunes 31
  });

  it('una ventana vacía no aplica nunca', () => {
    const s = schedule({ timeStart: '12:00:00', timeEnd: '12:00:00' });
    const r = promotionScheduleState(s, VIERNES());
    expect(r.reason).toBe('never');
    expect(r.nextStart).toBeNull();
  });

  it('la máscara sin días válidos no inventa un próximo arranque', () => {
    const r = promotionScheduleState(schedule({ daysOfWeekMask: 0 }), VIERNES());
    expect(r.appliesNow).toBe(false);
    expect(r.nextStart).toBeNull();
  });

  it('cruce de medianoche: dentro de la ventana que arrancó ayer', () => {
    const s = schedule({ timeStart: '22:00:00', timeEnd: '02:00:00' });
    expect(promotionScheduleState(s, new Date(2026, 7, 28, 1, 0)).appliesNow).toBe(true);
  });

  // La razón de ser del helper: no puede contradecir al motor que cobra.
  it('coincide con applyPromotion en cada caso', () => {
    const cases: PromotionSchedule[] = [
      schedule(),
      schedule({ daysOfWeekMask: NO_THURSDAY }),
      schedule({ timeStart: '17:00:00', timeEnd: '23:00:00' }),
      schedule({ activeFrom: '2026-08-28' }),
      schedule({ activeTo: '2026-08-26' }),
      schedule({ timeStart: '22:00:00', timeEnd: '02:00:00' }),
    ];
    const moments = [JUEVES(9), JUEVES(20), VIERNES(1), VIERNES(13), VIERNES(23, 30)];
    for (const s of cases) {
      for (const at of moments) {
        const def: PromotionDef = {
          id: 'p',
          type: 'PERCENT_OFF',
          discountPct: 0.2,
          productIds: new Set(['prod']),
          ...s,
        };
        const cobra =
          applyPromotion(
            { productId: 'prod', lineSubtotal: 10_000, quantity: 1, isCombo: false, at },
            [def],
          ).lineDiscount > 0;
        expect(promotionScheduleState(s, at).appliesNow).toBe(cobra);
      }
    }
  });
});
