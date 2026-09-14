import { describe, expect, it } from 'vitest';
import {
  chooseMonthTarget,
  periodProgress,
  projectMonthClose,
  MIN_DAYS_FOR_PROJECTION,
  MIN_SALES_FOR_MEASURED_MARGIN,
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
  // Cifras reales de producción, septiembre 2026 (día 14):
  //   fijos+únicos+compromisos = 10.252.800 · pérdidas del mes = 577.000
  //   margen bruto 61,4 % · margen de la carta 60,0 %
  const CUBRIR = 10_252_800 + 577_000;
  const base = { coverBase: CUBRIR, grossMarginPct: 0.614, catalogMarginPct: 0.5996 };

  it('divide TODO lo que hay que cubrir entre el margen BRUTO', () => {
    const t = chooseMonthTarget({ ...base, salesCount: 182 })!;
    expect(t.basis).toBe('gross');
    expect(t.marginPct).toBe(0.614);
    expect(Math.round(t.target)).toBe(Math.round(CUBRIR / 0.614)); // ≈ $17.638.111
  });

  it('las pérdidas del mes SÍ están adentro: si no, la meta se alcanza perdiendo plata', () => {
    const sinPerdidas = chooseMonthTarget({ ...base, coverBase: 10_252_800, salesCount: 182 })!;
    const conPerdidas = chooseMonthTarget({ ...base, salesCount: 182 })!;
    // Vender la meta SIN pérdidas deja la contribución justo en los fijos, y las
    // pérdidas del mes salen igual: el neto queda en −577.000.
    expect(sinPerdidas.target * 0.614 - 10_252_800 - 577_000).toBeCloseTo(-577_000, 0);
    // Con ellas adentro, el neto da CERO. Eso es un equilibrio de verdad.
    expect(conPerdidas.target * 0.614 - 10_252_800 - 577_000).toBeCloseTo(0, 0);
  });

  it('una pérdida nueva SUBE la meta; vender más NO la baja', () => {
    const antes = chooseMonthTarget({ ...base, salesCount: 182 })!;
    // Entra un conteo con 160.377 de faltante (el del 11 de septiembre).
    const despues = chooseMonthTarget({ ...base, coverBase: CUBRIR + 160_377, salesCount: 182 })!;
    expect(despues.target).toBeGreaterThan(antes.target);
    // Y el doble de ventas, con el mismo margen y las mismas pérdidas, deja la
    // meta IGUAL. Con la fórmula vieja bajaba: el monto fijo se diluía.
    const masVentas = chooseMonthTarget({ ...base, salesCount: 400 })!;
    expect(masVentas.target).toBe(antes.target);
  });

  it('con pocas ventas el bruto no es medible y manda el de la carta', () => {
    const t = chooseMonthTarget({ ...base, salesCount: MIN_SALES_FOR_MEASURED_MARGIN - 1 })!;
    expect(t.basis).toBe('catalog');
    expect(Math.round(t.target)).toBe(Math.round(CUBRIR / 0.5996));
  });

  it('un margen bruto en cero o negativo no se usa aunque sobren ventas', () => {
    const t = chooseMonthTarget({ ...base, grossMarginPct: -0.1, salesCount: 500 })!;
    expect(t.basis).toBe('catalog');
  });

  it('sin ninguno de los dos márgenes no inventa una meta', () => {
    expect(
      chooseMonthTarget({
        coverBase: CUBRIR,
        grossMarginPct: null,
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
