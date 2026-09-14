import { describe, expect, it } from 'vitest';
import {
  chooseMonthTarget,
  periodProgress,
  projectMonthClose,
  MIN_DAYS_FOR_PROJECTION,
  MIN_SALES_FOR_REALIZED_MARGIN,
} from './month-outlook';

const SEP = ['2026-09-01', '2026-09-30'] as const;

describe('periodProgress', () => {
  it('a mitad de mes dice por qué día va', () => {
    const p = periodProgress(...SEP, '2026-09-13');
    expect(p.daysTotal).toBe(30);
    expect(p.daysElapsed).toBe(13);
    expect(p.inProgress).toBe(true);
    expect(p.elapsedFraction).toBeCloseTo(13 / 30, 6);
  });

  it('el ÚLTIMO día del mes todavía está en curso: ese día se vende', () => {
    // Acá se vende de madrugada. Darlo por cerrado a las 9 de la mañana del 30
    // borraba la marca de hoy y la proyección sobre un día entero de venta.
    const p = periodProgress(...SEP, '2026-09-30');
    expect(p.status).toBe('in_progress');
    expect(p.inProgress).toBe(true);
    expect(p.daysElapsed).toBe(30);
    expect(p.elapsedFraction).toBe(1);
  });

  it('el día siguiente al cierre sí está cerrado', () => {
    const p = periodProgress(...SEP, '2026-10-01');
    expect(p.status).toBe('closed');
    expect(p.inProgress).toBe(false);
  });

  it('un mes viejo está completo', () => {
    const p = periodProgress(...SEP, '2026-11-02');
    expect(p.inProgress).toBe(false);
    expect(p.elapsedFraction).toBe(1);
  });

  it('un mes que todavía no empieza es FUTURO, no un mes cerrado', () => {
    const p = periodProgress(...SEP, '2026-08-20');
    expect(p.status).toBe('future');
    expect(p.inProgress).toBe(false);
    expect(p.daysElapsed).toBe(0);
    expect(p.elapsedFraction).toBe(0);
  });

  it('sirve para una ventana que no es el mes calendario', () => {
    // "Empieza el día 5": la ventana cruza de un mes al otro.
    const p = periodProgress('2026-09-05', '2026-10-04', '2026-09-20');
    expect(p.daysTotal).toBe(30);
    expect(p.daysElapsed).toBe(16);
  });

  it('el primer día del mes cuenta como un día corrido, no como cero', () => {
    const p = periodProgress(...SEP, '2026-09-01');
    expect(p.daysElapsed).toBe(1);
    expect(p.inProgress).toBe(true);
  });
});

describe('chooseMonthTarget', () => {
  const realizada = { realizedTarget: 18_537_213, realizedMarginPct: 0.5531 };
  const carta = { catalogTarget: 17_098_466, catalogMarginPct: 0.5996 };

  it('con ventas suficientes usa el margen REALIZADO: es el que cubre de verdad', () => {
    const t = chooseMonthTarget({ ...realizada, ...carta, salesCount: 182 })!;
    expect(t.basis).toBe('realized');
    expect(t.target).toBe(18_537_213);
  });

  it('con pocas ventas cae al margen de la carta: el realizado todavía salta', () => {
    const t = chooseMonthTarget({
      ...realizada,
      ...carta,
      salesCount: MIN_SALES_FOR_REALIZED_MARGIN - 1,
    })!;
    expect(t.basis).toBe('catalog');
    expect(t.target).toBe(17_098_466);
  });

  it('un margen realizado en cero o negativo no se usa aunque haya ventas', () => {
    const t = chooseMonthTarget({
      realizedTarget: null,
      realizedMarginPct: -0.1,
      ...carta,
      salesCount: 500,
    })!;
    expect(t.basis).toBe('catalog');
  });

  it('sin ninguna de las dos no inventa una meta', () => {
    expect(
      chooseMonthTarget({
        realizedTarget: null,
        realizedMarginPct: null,
        catalogTarget: null,
        catalogMarginPct: null,
        salesCount: 100,
      }),
    ).toBeNull();
  });
});

describe('projectMonthClose', () => {
  const base = {
    revenue: 9_412_000,
    salesCount: 182,
    contributionMarginPct: 0.5531,
    breakEvenBase: 10_252_800,
  };

  it('proyecta el cierre al ritmo de lo que va corrido', () => {
    const p = projectMonthClose({
      ...base,
      progress: periodProgress(...SEP, '2026-09-13'),
    })!;
    // 9.412.000 en 13 de 30 días -> el mes cierra cerca de 21,7M.
    expect(p.projectedRevenue).toBe(Math.round(9_412_000 / (13 / 30)));
    expect(p.projectedNet).toBe(
      Math.round((9_412_000 / (13 / 30)) * 0.5531 - 10_252_800),
    );
    // Y ese cierre da GANANCIA, aunque a mitad de mes el neto esté en rojo.
    expect(p.projectedNet).toBeGreaterThan(0);
  });

  it('un mes terminado no se proyecta: ya se sabe cómo cerró', () => {
    expect(
      projectMonthClose({ ...base, progress: periodProgress(...SEP, '2026-10-05') }),
    ).toBeNull();
  });

  it('con pocas ventas no proyecta: sería un número inventado', () => {
    expect(
      projectMonthClose({
        ...base,
        salesCount: 4,
        progress: periodProgress(...SEP, '2026-09-08'),
      }),
    ).toBeNull();
  });

  it('con pocos DÍAS tampoco proyecta, aunque sobren ventas', () => {
    // Un local hace 40 tickets en un solo día: sin piso de días, un sábado
    // bueno proyectaba un mes fantástico con cara de dato.
    const casi = periodProgress(...SEP, `2026-09-0${MIN_DAYS_FOR_PROJECTION - 1}`);
    expect(casi.daysElapsed).toBe(MIN_DAYS_FOR_PROJECTION - 1);
    expect(projectMonthClose({ ...base, progress: casi })).toBeNull();
    const justo = periodProgress(...SEP, `2026-09-0${MIN_DAYS_FOR_PROJECTION}`);
    expect(projectMonthClose({ ...base, progress: justo })).not.toBeNull();
  });

  it('sin margen de contribución no proyecta', () => {
    expect(
      projectMonthClose({
        ...base,
        contributionMarginPct: null,
        progress: periodProgress(...SEP, '2026-09-13'),
      }),
    ).toBeNull();
  });

  it('sin ventas no proyecta', () => {
    expect(
      projectMonthClose({
        ...base,
        revenue: 0,
        progress: periodProgress(...SEP, '2026-09-13'),
      }),
    ).toBeNull();
  });
});
