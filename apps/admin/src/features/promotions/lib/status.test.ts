import { describe, expect, it } from 'vitest';
import { promotionStatus, type PromotionStatusInput } from './status';

const base: PromotionStatusInput = {
  isActive: true,
  daysOfWeekMask: 127,
  timeStart: '00:00:00',
  timeEnd: '23:59:00',
  activeFrom: null,
  activeTo: null,
};

/** 2026-08-27 es jueves; 2026-08-28, viernes. */
const JUEVES = new Date(2026, 7, 27, 13, 54);
const VIERNES = new Date(2026, 7, 28, 13, 0);

describe('promotionStatus', () => {
  it('la promo que sí descuenta lo dice sin ambigüedad', () => {
    const r = promotionStatus(base, VIERNES);
    expect(r.label).toBe('Descontando ahora');
    expect(r.tone).toBe('success');
  });

  it('reproduce el caso de prod: activa, vigente y aun así sin descontar', () => {
    // 119 = todos los días menos jueves. Era exactamente la promo del 27/08.
    const r = promotionStatus(
      { ...base, daysOfWeekMask: 119, activeFrom: '2026-08-27', activeTo: '2026-08-28' },
      JUEVES,
    );
    expect(r.label).toBe('Hoy no aplica');
    expect(r.hint).toContain('jueves');
    expect(r.hint).toContain('mañana');
  });

  it('la apagada no se confunde con la que no aplica hoy', () => {
    expect(promotionStatus({ ...base, isActive: false }, VIERNES).label).toBe('Apagada');
  });

  it('vencida dice hasta cuándo estuvo vigente', () => {
    const r = promotionStatus({ ...base, activeTo: '2026-08-27' }, VIERNES);
    expect(r.label).toBe('Vencida');
    expect(r.hint).toContain('2026-08-27');
  });

  it('fuera de horario nombra la franja', () => {
    const r = promotionStatus(
      { ...base, timeStart: '17:00:00', timeEnd: '23:00:00' },
      new Date(2026, 7, 28, 9, 0),
    );
    expect(r.label).toBe('Fuera de horario');
    expect(r.hint).toContain('de 17:00 a 23:00');
    expect(r.hint).toContain('hoy a las 17:00');
  });

  it('programada dice cuándo arranca', () => {
    const r = promotionStatus({ ...base, activeFrom: '2026-09-01' }, VIERNES);
    expect(r.label).toBe('Programada');
    expect(r.hint).toContain('martes');
  });

  it('ventana vacía se marca como configuración imposible', () => {
    const r = promotionStatus({ ...base, timeStart: '12:00:00', timeEnd: '12:00:00' }, VIERNES);
    expect(r.label).toBe('Sin horario válido');
    expect(r.tone).toBe('danger');
  });

  it('los textos no usan voseo', () => {
    const inputs: PromotionStatusInput[] = [
      base,
      { ...base, isActive: false },
      { ...base, daysOfWeekMask: 119 },
      { ...base, activeTo: '2026-08-01' },
      { ...base, activeFrom: '2026-09-01' },
      { ...base, timeStart: '17:00:00', timeEnd: '23:00:00' },
      { ...base, timeStart: '12:00:00', timeEnd: '12:00:00' },
    ];
    for (const i of inputs) {
      const { hint } = promotionStatus(i, JUEVES);
      expect(hint).not.toMatch(/\b(podés|tenés|querés|cambiá|volvé|elegí|revisá)\b/i);
    }
  });
});
