import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_ANALYSIS_SYSTEM,
  buildDailySummaryUserPrompt,
  buildFinancialAnalysisUserPrompt,
  buildPurchaseSuggestionUserPrompt,
  buildShiftCloseUserPrompt,
  type FinancialAnalysisInput,
} from './prompt';

/**
 * Los prompts son la ÚNICA vía por la que la IA ve los números del negocio. Un
 * campo que se cae del template no rompe nada visible: el modelo simplemente
 * analiza con menos datos y responde algo plausible pero infundado. Estos tests
 * fijan que cada dato del input aparezca en el texto.
 */

describe('buildPurchaseSuggestionUserPrompt', () => {
  const base = {
    itemName: 'Pechuga de pollo',
    unitPurchase: 'caja',
    currentStock: 2.5,
    thresholdMin: 10,
    unitStock: 'kg',
    suggestedQty: 3,
    estUnitCost: 48_500,
    estTotal: 145_500,
    history: [],
  };

  it('incluye item, stock, umbral y la cantidad sugerida', () => {
    const p = buildPurchaseSuggestionUserPrompt(base);
    expect(p).toContain('Pechuga de pollo');
    expect(p).toContain('2.5 kg');
    expect(p).toContain('10 kg');
    expect(p).toContain('comprar 3 caja');
  });

  it('formatea los costos con separador de miles colombiano', () => {
    const p = buildPurchaseSuggestionUserPrompt(base);
    expect(p).toContain('$48.500/caja');
    expect(p).toContain('total ~$145.500');
  });

  it('dice explícitamente que no hay costo histórico en vez de mostrar $0', () => {
    const p = buildPurchaseSuggestionUserPrompt({ ...base, estUnitCost: null, estTotal: null });
    expect(p).toContain('(sin costo histórico)');
    expect(p).not.toContain('$0');
  });

  it('sin historial lo declara (no deja la sección en blanco)', () => {
    expect(buildPurchaseSuggestionUserPrompt(base)).toContain('(sin compras registradas)');
  });

  it('lista cada compra del historial con proveedor y precio', () => {
    const p = buildPurchaseSuggestionUserPrompt({
      ...base,
      history: [
        { date: '2026-07-01', supplierName: 'Avícola Norte', qty: 2, unit: 'caja', unitPrice: 47_000 },
        { date: '2026-06-15', supplierName: 'Distri Sur', qty: 4, unit: 'caja', unitPrice: 45_200 },
      ],
    });
    expect(p).toContain('2026-07-01 · Avícola Norte · 2 caja a $47.000/caja');
    expect(p).toContain('2026-06-15 · Distri Sur · 4 caja a $45.200/caja');
  });
});

describe('buildShiftCloseUserPrompt', () => {
  const base = {
    openingCash: 100_000,
    cashSalesTotal: 850_000,
    cashIn: 20_000,
    cashOut: 50_000,
    expectedCash: 920_000,
    countedCash: 905_000,
    difference: -15_000,
    voidCount: 2,
    noSaleDrawerCount: 1,
  };

  it('incluye las 6 cifras del arqueo', () => {
    const p = buildShiftCloseUserPrompt(base);
    expect(p).toContain('$100.000');
    expect(p).toContain('$850.000');
    expect(p).toContain('$20.000');
    expect(p).toContain('$50.000');
    expect(p).toContain('$920.000');
    expect(p).toContain('$905.000');
  });

  it('etiqueta la diferencia como faltante / sobrante / exacto', () => {
    expect(buildShiftCloseUserPrompt(base)).toContain('(faltante)');
    expect(buildShiftCloseUserPrompt({ ...base, difference: 15_000 })).toContain('(sobrante)');
    expect(buildShiftCloseUserPrompt({ ...base, difference: 0 })).toContain('(exacto)');
  });

  it('incluye las señales antifraude (anulaciones y aperturas sin venta)', () => {
    const p = buildShiftCloseUserPrompt(base);
    expect(p).toContain('anuladas en el turno: 2');
    expect(p).toContain('cajón sin venta: 1');
  });
});

describe('buildDailySummaryUserPrompt', () => {
  const base = {
    date: '2026-07-22',
    revenue: 1_450_000,
    orderCount: 62,
    avgTicket: 23_387,
    cashRevenue: 900_000,
    digitalRevenue: 550_000,
    voidCount: 1,
    cashDifference: -5_000,
    lowStockCount: 4,
    topProducts: [],
  };

  it('incluye la fecha y las métricas del día', () => {
    const p = buildDailySummaryUserPrompt(base);
    expect(p).toContain('2026-07-22');
    expect(p).toContain('$1.450.000 en 62 pedidos');
    expect(p).toContain('$900.000');
    expect(p).toContain('$550.000');
    expect(p).toContain('stock bajo: 4');
  });

  it('distingue "sin cierre" de una diferencia de $0', () => {
    expect(buildDailySummaryUserPrompt({ ...base, cashDifference: null })).toContain('sin cierre');
    expect(buildDailySummaryUserPrompt({ ...base, cashDifference: 0 })).toContain(
      'Diferencia de caja al cierre: $0',
    );
  });

  it('omite la línea de más vendidos cuando no hubo ventas', () => {
    expect(buildDailySummaryUserPrompt(base)).not.toContain('Más vendidos');
  });

  it('lista los más vendidos con su cantidad', () => {
    const p = buildDailySummaryUserPrompt({
      ...base,
      topProducts: [
        { name: 'Tercos Burger', qty: 31 },
        { name: 'Papas', qty: 24 },
      ],
    });
    expect(p).toContain('Tercos Burger (31), Papas (24)');
  });
});

describe('buildFinancialAnalysisUserPrompt', () => {
  const base = {
    year: 2026,
    month: 6,
    monthLabel: 'junio 2026',
    revenue: 32_000_000,
    cogs: 12_000_000,
    grossMargin: 20_000_000,
    grossMarginPct: 0.625,
    totalFixed: 18_000_000,
    fixedCosts: [],
    otherLosses: [],
    netResult: 2_000_000,
    salesCount: 640,
    grossRevenue: 32_000_000,
    discountTotal: 0,
    cogsEstimated: false,
    cogsPartial: false,
    breakEvenBase: 18_000_000,
    contributionMargin: 20_000_000,
    contributionMarginPct: 0.625,
    breakEven: 28_800_000,
    breakEvenCoverage: 1.11,
    catalogBreakEven: {
      target: 27_000_000,
      marginPct: 0.667,
      coverage: 1.185,
      weightedBySales: true,
      productsConsidered: 18,
      productsWithoutCost: 0,
      best: { name: 'Limonada', marginPct: 0.82 },
      worst: { name: 'Burro de pollo', marginPct: 0.51 },
    },
    deliveryCollected: 0,
    deliveryOrderCount: 0,
    trend: [],
  } satisfies FinancialAnalysisInput;

  it('incluye el P&G del mes con el margen en porcentaje', () => {
    const p = buildFinancialAnalysisUserPrompt(base);
    expect(p).toContain('junio 2026');
    expect(p).toContain('$32.000.000');
    expect(p).toContain('$12.000.000');
    expect(p).toContain('62.5%');
    expect(p).toContain('$2.000.000');
  });

  it('desglosa los costos fijos y marca los que vienen de Nómina', () => {
    const p = buildFinancialAnalysisUserPrompt({
      ...base,
      fixedCosts: [
        { name: 'Arriendo', category: 'Local', monthlyAmount: 4_000_000, isPayroll: false, isEstimated: false },
        { name: 'Sueldos', category: 'Personal', monthlyAmount: 9_000_000, isPayroll: true, isEstimated: false },
      ],
    });
    expect(p).toContain('· Arriendo (Local): $4.000.000');
    expect(p).toContain('· Sueldos (Personal): $9.000.000 [auto desde Nómina]');
  });

  it('le muestra al modelo el MISMO equilibrio que ve el dueño (el de la carta), aparte del realizado', () => {
    const p = buildFinancialAnalysisUserPrompt(base);
    expect(p).toContain('Punto de equilibrio DE LA CARTA (el que ve el dueño): ventas necesarias $27.000.000 · cobertura 118.5% · de cada $100 vendidos quedan $67 · 18 opciones de la carta ponderadas por lo vendido');
    expect(p).toContain('el que más deja: Limonada (82.0%); el que menos: Burro de pollo (51.0%)');
    expect(p).toContain('Punto de equilibrio REALIZADO (con la merma, cortesías, faltantes y fletes del mes): $28.800.000 · cobertura 111.0%');
    expect(p).toContain('640 ventas cobradas');
    expect(FINANCIAL_ANALYSIS_SYSTEM).toContain('"tono" se decide con la cobertura del equilibrio DE LA CARTA');
  });

  it('solo muestra descuentos y domicilios cuando los hubo, y aclara que el domicilio no es ingreso', () => {
    const sin = buildFinancialAnalysisUserPrompt(base);
    expect(sin).not.toContain('Ventas a precio de lista');
    expect(sin).not.toContain('Domicilios cobrados');
    const con = buildFinancialAnalysisUserPrompt({
      ...base,
      grossRevenue: 33_000_000,
      discountTotal: 1_000_000,
      deliveryCollected: 350_000,
      deliveryOrderCount: 50,
    });
    expect(con).toContain('- Ventas a precio de lista: $33.000.000');
    expect(con).toContain('- Descuentos y promociones (ya restados): $1.000.000');
    expect(con).toContain('- Domicilios cobrados a clientes: $350.000 en 50 pedidos (NO es ingreso');
  });

  it('rotula como provisional el COGS estimado o parcial y las pérdidas estimadas', () => {
    const parcial = buildFinancialAnalysisUserPrompt({ ...base, cogsPartial: true, cogsEstimated: true });
    expect(parcial).toContain('[parcial: parte de lo vendido no tiene costo cargado → el COGS está SUBESTIMADO');
    const estimado = buildFinancialAnalysisUserPrompt({ ...base, cogsEstimated: true });
    expect(estimado).toContain('[estimado en parte: ventas sin stock costeadas al último precio');
    const perdidas = buildFinancialAnalysisUserPrompt({
      ...base,
      otherLosses: [
        { label: 'Merma', amount: 50_000, estimated: true },
        { label: 'Faltantes', amount: 20_000 },
        { label: 'Reembolsos', amount: 0 },
      ],
    });
    expect(perdidas).toContain('    · Merma: $50.000 [estimado]');
    expect(perdidas).toContain('    · Faltantes: $20.000\n');
    expect(perdidas).not.toContain('Reembolsos');
  });

  it('cuando la carta no deja ganancia o no se puede calcular, lo dice en vez de inventar una meta', () => {
    const sinMargen = buildFinancialAnalysisUserPrompt({
      ...base,
      catalogBreakEven: { ...base.catalogBreakEven, marginPct: -0.1, target: null },
    });
    expect(sinMargen).toContain('los productos no dejan ganancia');
    const sinCosto = buildFinancialAnalysisUserPrompt({
      ...base,
      catalogBreakEven: { ...base.catalogBreakEven, marginPct: null, target: null, coverage: null },
    });
    expect(sinCosto).toContain('todavía no se puede calcular');
    const sinContribucion = buildFinancialAnalysisUserPrompt({ ...base, breakEven: null, breakEvenCoverage: null });
    expect(sinContribucion).toContain('Punto de equilibrio REALIZADO: no existe este mes');
  });

  it('marca el costo fijo que todavía no tiene pago como estimado, para que el modelo no lo lea como dato', () => {
    const p = buildFinancialAnalysisUserPrompt({
      ...base,
      fixedCosts: [
        { name: 'Servicios', category: 'Servicios', monthlyAmount: 900_000, isPayroll: false, isEstimated: true },
        { name: 'Arriendo', category: 'Local', monthlyAmount: 1_680_000, isPayroll: false, isEstimated: false },
      ],
    });
    expect(p).toContain('· Servicios (Servicios): $900.000 [estimado: todavía sin pago registrado este mes]');
    expect(p).toContain('· Arriendo (Local): $1.680.000\n');
    expect(p).not.toContain('Arriendo (Local): $1.680.000 [estimado');
  });

  it('omite break-even y cobertura cuando no se pueden calcular', () => {
    const p = buildFinancialAnalysisUserPrompt({
      ...base,
      breakEven: null,
      breakEvenCoverage: null,
    });
    expect(p).not.toContain('break-even');
    expect(p).not.toContain('Cobertura');
  });

  it('topa la cobertura al 200% (un mes atípico no debe distorsionar el análisis)', () => {
    const p = buildFinancialAnalysisUserPrompt({ ...base, breakEvenCoverage: 9.5 });
    expect(p).toContain('$28.800.000 · cobertura 200.0%');
  });

  it('omite la tendencia con un solo punto y la incluye con varios', () => {
    const trend = [
      { monthLabel: 'mayo 2026', revenue: 30_000_000, cogs: 11_000_000, totalFixed: 18_000_000, netResult: 1_000_000 },
      { monthLabel: 'junio 2026', revenue: 32_000_000, cogs: 12_000_000, totalFixed: 18_000_000, netResult: 2_000_000 },
    ];
    expect(buildFinancialAnalysisUserPrompt({ ...base, trend: [trend[0]] })).not.toContain(
      'Tendencia',
    );
    const p = buildFinancialAnalysisUserPrompt({ ...base, trend });
    expect(p).toContain('Tendencia de los últimos meses');
    expect(p).toContain('mayo 2026: ingresos $30.000.000');
    expect(p).toContain('neto $2.000.000');
  });

  it('cierra pidiendo el JSON (el caller parsea la respuesta)', () => {
    expect(buildFinancialAnalysisUserPrompt(base).trimEnd()).toMatch(/JSON según las reglas\.$/);
  });
});
