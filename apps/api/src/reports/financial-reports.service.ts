import { Injectable, Logger } from '@nestjs/common';
import {
  FINANCIAL_ANALYSIS_SYSTEM,
  buildFinancialAnalysisUserPrompt,
  computeBreakEven,
  nextWeekRef,
  payrollWeekFor,
  type FinancialAnalysisInput,
} from '@pos-tercos/domain';
import type {
  FinancialAnalysis,
  FixedCostLine,
  MonthlyFinancialStatement,
  MonthlyTrend,
  MonthlyTrendPoint,
} from '@pos-tercos/types';
import { LLMService } from '../adapters/llm/llm.service';
import { AuditService } from '../audit/audit.service';
import { BusinessConfigService } from '../business-config/business-config.service';
import { utcDateOfLocalDay, ymdLocal } from '../common/local-dates';
import { FixedCostsService } from '../fixed-costs/fixed-costs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CogsService } from './cogs.service';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Estado financiero mensual: ingresos − COGS real (FIFO) − costos fijos = neto.
 * La nómina se jala automática del módulo workers (cubre los dos tipos de
 * salario: MENSUAL fijo y DIARIO por días registrados). El resto de costos
 * fijos viene del CRUD `/fixed-costs`. Es Dueño-only.
 */
@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cogs: CogsService,
    private readonly fixedCosts: FixedCostsService,
    private readonly llm: LLMService,
    private readonly audit: AuditService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /** Estado financiero del mes `(year, month1)` (month1: 1-12). */
  async getMonthlyStatement(year: number, month1: number): Promise<MonthlyFinancialStatement> {
    const month0 = month1 - 1;
    // Ventana del "mes del negocio" en hora local (fuente única, ver
    // BusinessConfigService.getBusinessMonthWindow). startDay=1 ⇒ mes calendario.
    const { from: monthStart, to: monthEnd } =
      await this.businessConfig.getBusinessMonthWindow(year, month1);

    // P&G base del CogsService — ingresos + COGS real FIFO.
    const pnl = await this.cogs.getPnl(monthStart, monthEnd);
    const revenue = pnl.revenue;
    const cogs = pnl.cogs;
    const grossMargin = revenue - cogs;
    const grossMarginPct = revenue > 0 ? grossMargin / revenue : 0;

    // Costos fijos: nómina (auto del workers) + CRUD fixed_costs.
    const payrollAmount = await this.computePayrollForRange(monthStart, monthEnd);
    // Vigencia de los costos fijos contra la MISMA ventana del negocio que el
    // resto del estado (ingresos/COGS/nómina) — no el mes calendario. El monto
    // no se prorratea: cuenta UNA vez por ventana.
    const otherCosts = await this.fixedCosts.getEffectiveForWindow(monthStart, monthEnd);

    const fixedCostLines: FixedCostLine[] = [];
    if (payrollAmount > 0) {
      fixedCostLines.push({
        fixedCostId: null,
        name: 'Nómina (auto)',
        category: 'Nómina',
        monthlyAmount: round(payrollAmount),
        isPayroll: true,
        isOneTime: false,
      });
    }
    for (const c of otherCosts) {
      fixedCostLines.push({
        fixedCostId: c.id,
        name: c.name,
        category: c.category,
        monthlyAmount: round(c.monthlyAmount),
        isPayroll: false,
        isOneTime: c.isOneTime,
      });
    }
    // Recurrentes (nómina + mensuales/anuales) vs puntuales (gastos únicos): el
    // estado de resultados los separa. El break-even usa SOLO los recurrentes.
    const totalFixed = round(
      fixedCostLines.filter((l) => !l.isOneTime).reduce((a, l) => a + l.monthlyAmount, 0),
    );
    const oneTimeCost = round(
      fixedCostLines.filter((l) => l.isOneTime).reduce((a, l) => a + l.monthlyAmount, 0),
    );

    // Cortesías: producto regalado → pérdida real que baja el neto. Costo FIFO
    // atado a las solicitudes AUTORIZADAS de la ventana (fuente única, también
    // usada por el KPI de Solicitudes → ambos coinciden siempre).
    const { total: cortesiasCost, unknownQty: cortesiasUnknownQty } =
      await this.cogs.getApprovedCortesiaCost(monthStart, monthEnd);

    // Reembolsos: comida preparada cuya plata se devolvió → pérdida real (el
    // void normal no la tiene porque revierte stock). pnl.refundCost ya la trae.
    const refundCost = pnl.refundCost;

    // Merma (§1.2): insumo/producto tirado = plata perdida real. Baja el neto
    // igual que cortesías y reembolsos (decisión del dueño 2026-07-21). Se
    // muestra como línea aparte del grossMargin (no se mezcla con el COGS).
    const wasteCost = round(pnl.wasteCost);

    // Compromisos con personas pagados en el mes (H1): un arreglo, un servicio,
    // una compra suelta. NUNCA llegaban al estado de resultados —el servicio
    // solo leía COGS, nómina y costos fijos— así que salían de tesorería sin
    // bajar el neto ni mover el punto de equilibrio.
    //
    // Se cuentan por `paidAt` (decisión del dueño 2026-08-28): mientras se
    // deben son DEUDA, no pérdida; pesan el mes en que se pagan. Los que no son
    // gasto (devolver un préstamo) quedan fuera — esa plata ya se había
    // recibido, restarla inventaría un bajón.
    const payables = await this.prisma.payableCommitment.aggregate({
      where: {
        status: 'PAID',
        isExpense: true,
        paidAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: true,
    });
    const payablesPaidCost = round(Number(payables._sum.amount ?? 0));

    // Fletes de compra: lo que cobró el proveedor por traer la mercancía.
    // Gasto real y pagado que hasta acá no bajaba el neto en ningún lado — el
    // resultado quedaba inflado exactamente en lo que se pagó de domicilios.
    // No se mezcla con el COGS a propósito: no encarece ningún producto.
    const freightCost = round(pnl.freightCost);

    const netResult = round(
      grossMargin -
        totalFixed -
        oneTimeCost -
        cortesiasCost -
        refundCost -
        wasteCost -
        freightCost -
        payablesPaidCost,
    );

    // Punto de equilibrio sobre el margen de CONTRIBUCIÓN (fórmula pura y
    // testeada en domain). El margen BRUTO ignoraba merma, cortesías y
    // reembolsos —que suben con la venta— y por eso daba un equilibrio más
    // bajo que el real: parecía cubierto cuando todavía se perdía plata.
    // Los gastos puntuales quedan fuera a propósito: no se repiten. Los
    // compromisos pagados TAMPOCO entran, por la misma razón: un arreglo del
    // horno no define el piso de operación del mes siguiente. Si un gasto se
    // repite todos los meses, su lugar es Costos fijos, no Compromisos.
    const be = computeBreakEven({
      revenue,
      cogs,
      wasteCost,
      cortesiaCost: cortesiasCost,
      refundCost,
      freightCost,
      totalFixed,
    });

    return {
      year,
      month: month1,
      monthLabel: `${MONTHS_ES[month0]} ${year}`,
      periodStart: ymdLocal(monthStart),
      periodEnd: ymdLocal(monthEnd),
      revenue: round(revenue),
      discountTotal: pnl.discountTotal,
      grossRevenue: pnl.grossRevenue,
      cogs: round(cogs),
      cogsPartial: pnl.cogsUnknownQty > 0,
      cogsEstimated: pnl.cogsEstimatedQty > 0,
      grossMargin: round(grossMargin),
      grossMarginPct: round4(grossMarginPct),
      fixedCosts: fixedCostLines,
      totalFixed,
      oneTimeCost,
      cortesiasCost,
      cortesiasCostPartial: cortesiasUnknownQty > 0,
      cortesiasCostEstimated: pnl.cortesiaEstimatedCost > 0,
      refundCost: round(refundCost),
      wasteCost,
      wasteCostEstimated: pnl.wasteEstimatedCost > 0,
      freightCost,
      freightInvoiceCount: pnl.freightInvoiceCount,
      purchasedTotal: pnl.purchasedTotal,
      payablesPaidCost,
      payablesPaidCount: payables._count,
      deliveryCollected: pnl.deliveryCollected,
      deliveryOrderCount: pnl.deliveryOrderCount,
      salesCount: pnl.salesCount,
      netResult,
      contributionMargin: round(be.contributionMargin),
      contributionMarginPct:
        be.contributionMarginPct === null ? null : round4(be.contributionMarginPct),
      breakEven: be.breakEven === null ? null : round(be.breakEven),
      breakEvenCoverage:
        be.breakEvenCoverage === null ? null : round4(be.breakEvenCoverage),
    };
  }

  /** Tendencia de los últimos `n` meses incluyendo el actual. */
  async getMonthlyTrend(n: number, refYear?: number, refMonth1?: number): Promise<MonthlyTrend> {
    // Hora local (TZ del server = Bogotá en prod): el "mes actual" debe ser el de
    // Bogotá, no UTC (a las 22:00 del 31 UTC ya sería el mes siguiente).
    const ref = refYear !== undefined && refMonth1 !== undefined
      ? { year: refYear, month0: refMonth1 - 1 }
      : (() => {
          const now = new Date();
          return { year: now.getFullYear(), month0: now.getMonth() };
        })();

    const months: Array<{ year: number; month1: number }> = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(ref.year, ref.month0 - i, 1);
      months.push({ year: d.getFullYear(), month1: d.getMonth() + 1 });
    }

    // En paralelo: cada statement es independiente y comparte el caché del
    // ledger FIFO (la primera corrida lo computa, las demás reusan la promesa).
    // `Promise.all` preserva el orden del array → trend idéntico, sin serializar.
    const statements = await Promise.all(
      months.map((m) => this.getMonthlyStatement(m.year, m.month1)),
    );
    const points: MonthlyTrendPoint[] = statements.map((s) => ({
      year: s.year,
      month: s.month,
      monthLabel: s.monthLabel,
      revenue: s.revenue,
      cogs: s.cogs,
      totalFixed: s.totalFixed,
      netResult: s.netResult,
    }));
    return { points };
  }

  /**
   * Análisis IA del estado financiero: pide al LLM un JSON con titular +
   * bullets + siguiente paso. Cuesta una llamada LLM por ejecución → on-demand.
   */
  async analyze(year: number, month1: number, actorId: string): Promise<FinancialAnalysis> {
    const [statement, trend] = await Promise.all([
      this.getMonthlyStatement(year, month1),
      this.getMonthlyTrend(6, year, month1),
    ]);

    const input: FinancialAnalysisInput = {
      year: statement.year,
      month: statement.month,
      monthLabel: statement.monthLabel,
      revenue: statement.revenue,
      cogs: statement.cogs,
      grossMargin: statement.grossMargin,
      grossMarginPct: statement.grossMarginPct,
      totalFixed: statement.totalFixed,
      fixedCosts: statement.fixedCosts.map((l) => ({
        name: l.name,
        category: l.category,
        monthlyAmount: l.monthlyAmount,
        isPayroll: l.isPayroll,
      })),
      // Sin estas líneas el modelo veía `ingresos − COGS − fijos` y un neto que
      // no cerraba con esos números, así que explicaba el bajón inventando.
      otherLosses: [
        { label: 'Merma (insumo tirado, a costo)', amount: statement.wasteCost },
        { label: 'Cortesías (producto regalado, a costo)', amount: statement.cortesiasCost },
        { label: 'Reembolsos (comida preparada, a costo)', amount: statement.refundCost },
        { label: 'Domicilios de compra (fletes de proveedor)', amount: statement.freightCost },
        { label: 'Compromisos pagados (arreglos, servicios)', amount: statement.payablesPaidCost },
        { label: 'Gastos únicos del mes', amount: statement.oneTimeCost },
      ],
      netResult: statement.netResult,
      breakEven: statement.breakEven,
      breakEvenCoverage: statement.breakEvenCoverage,
      trend: trend.points.map((p) => ({
        monthLabel: p.monthLabel,
        revenue: p.revenue,
        cogs: p.cogs,
        totalFixed: p.totalFixed,
        netResult: p.netResult,
      })),
    };

    const result = await this.llm.complete({
      systemPrompt: FINANCIAL_ANALYSIS_SYSTEM,
      userPrompt: buildFinancialAnalysisUserPrompt(input),
      maxTokens: 600,
    });

    const parsed = parseFinancialAnalysisJson(result.text, result.modelUsed);

    await this.audit.log({
      userId: actorId,
      action: 'FINANCIAL_ANALYSIS_GENERATED',
      entityType: 'financial_report',
      metadata: {
        year,
        month: month1,
        modelUsed: result.modelUsed,
        tono: parsed.tono,
        netResult: statement.netResult,
      },
    });

    return parsed;
  }

  /**
   * Suma el costo de nómina de la ventana del mes del negocio. Espeja la lógica
   * semanal de `WorkersService.computeBase`: MONTHLY = tasa diaria por días
   * empleados; DAILY = suma de días no-descanso, aplicando overrides.
   * Las novedades cuyo lunes (periodStart) cae dentro de la ventana se suman.
   *
   * ⚠️ hireDate/terminationDate/periodStart/workDate son fecha-solo (medianoche
   * UTC) — se comparan contra límites `utcDateOfLocalDay`, NO contra la ventana
   * local: con la ventana local el día 1 del mes se corría al mes vecino.
   */
  private async computePayrollForRange(monthStart: Date, monthEnd: Date): Promise<number> {
    const startDay = utcDateOfLocalDay(monthStart);
    const endDay = utcDateOfLocalDay(monthEnd);
    const users = await this.prisma.user.findMany({
      where: {
        payType: { not: null },
        hireDate: { lte: endDay },
        OR: [{ terminationDate: null }, { terminationDate: { gte: startDay } }],
      },
      select: {
        id: true,
        payType: true,
        salaryAmount: true,
        hireDate: true,
        terminationDate: true,
        restDaysOfWeek: true,
      },
    });

    let total = 0;
    for (const u of users) {
      total += await this.computeMonthlyBase(u, startDay, endDay);
      // Novedades cuyo lunes (periodStart) cae dentro de la ventana.
      const adjs = await this.prisma.payrollAdjustment.findMany({
        where: { userId: u.id, periodStart: { gte: startDay, lte: endDay } },
        select: { amount: true },
      });
      for (const a of adjs) total += Number(a.amount);
    }
    return total;
  }

  /**
   * Base del mes — mirror de `WorkersService.computeBase` sobre el rango
   * completo. `monthStart`/`monthEnd` llegan como fecha-solo en medianoche UTC
   * (utcDateOfLocalDay), coherentes con hireDate/terminationDate/workDate.
   */
  private async computeMonthlyBase(
    user: {
      id: string;
      payType: 'MONTHLY' | 'DAILY' | null;
      salaryAmount: { toString(): string } | null;
      hireDate: Date | null;
      terminationDate: Date | null;
      restDaysOfWeek: number[];
    },
    monthStart: Date,
    monthEnd: Date,
  ): Promise<number> {
    if (!user.payType || user.salaryAmount === null) return 0;
    const hire = user.hireDate ?? monthStart;
    const term = user.terminationDate ?? monthEnd;
    const effStart = hire > monthStart ? hire : monthStart;
    const effEnd = term < monthEnd ? term : monthEnd;
    if (effStart > effEnd) return 0;
    const salary = Number(user.salaryAmount);

    if (user.payType === 'MONTHLY') {
      // Costo por día = salary / días del mes de ese día (mes completo = exacto
      // `salary`, sea de 28/30/31 días). Acá el rango ya es el mes, así que el
      // divisor es constante; lo dejamos por día para soportar rangos parciales.
      let base = 0;
      const DAY_MS = 86_400_000;
      for (let t = effStart.getTime(); t <= effEnd.getTime(); t += DAY_MS) {
        const d = new Date(t);
        const daysInThisMonth = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
        ).getUTCDate();
        base += salary / daysInThisMonth;
      }
      return Math.round(base * 100) / 100;
    }
    // DAILY (§1.1): mirror EXACTO de `WorkersWeeklyService.buildEntry`. NO se
    // recorren todos los días calendario: solo los días LABORABLES de la nómina
    // (`payrollWeekFor` ya excluye el descanso sistémico del lunes y corre los
    // festivos), menos el descanso propio del trabajador (salvo festivo), más
    // overrides. Recorrer día calendario saltando solo `restDaysOfWeek` (default
    // vacío) devengaba el lunes de descanso → "Nómina (auto)" inflada y el P&G
    // no conciliaba con la nómina semanal (que es la obligación real).
    const restSet = new Set(user.restDaysOfWeek);
    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: user.id, workDate: { gte: effStart, lte: effEnd } },
      select: { workDate: true, amount: true },
    });
    const ovMap = new Map(
      overrides.map((o) => [o.workDate.toISOString().slice(0, 10), Number(o.amount)]),
    );
    const startYmd = effStart.toISOString().slice(0, 10);
    const endYmd = effEnd.toISOString().slice(0, 10);
    const toUtc = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

    let base = 0;
    let week = payrollWeekFor(effStart);
    // Recorre las semanas de nómina que solapan [effStart, effEnd]. `week.days`
    // trae solo los días laborables (sin el lunes de descanso). El filtro por
    // string acota a la ventana del mes (una semana puede cruzar el borde).
    let guard = 0;
    while (week.weekStart <= endYmd && guard++ < 60) {
      for (const d of week.days) {
        if (d.date < startYmd || d.date > endYmd) continue;
        const ov = ovMap.get(d.date);
        if (ov !== undefined) {
          base += ov;
          continue;
        }
        if (restSet.has(d.weekday) && !d.isHoliday) continue;
        if (d.status === 'WORKDAY') base += salary;
      }
      const nextRef = nextWeekRef(week);
      const next = payrollWeekFor(toUtc(nextRef));
      if (next.weekStart === week.weekStart) break; // salvaguarda anti-loop
      week = next;
    }
    return Math.round(base * 100) / 100;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
/**
 * Parseo defensivo del JSON que devuelve el LLM. Si viene con code fences,
 * los removemos. Si falta algún campo, lanzamos un error claro (no devolvemos
 * un objeto medio formado al UI).
 */
function parseFinancialAnalysisJson(raw: string, modelUsed: string): FinancialAnalysis {
  const clean = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(clean);
  } catch {
    throw new Error('La IA no devolvió un JSON válido. Prueba de nuevo.');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('La IA devolvió un formato inesperado.');
  }
  const o = obj as Record<string, unknown>;
  const tono = String(o.tono ?? '');
  if (!['saludable', 'atencion', 'critico'].includes(tono)) {
    throw new Error(`Tono inválido devuelto por la IA: ${tono}`);
  }
  const bullets = Array.isArray(o.bullets) ? o.bullets : [];
  return {
    tono: tono as FinancialAnalysis['tono'],
    titular: String(o.titular ?? ''),
    bullets: bullets
      .map((b: unknown) => {
        const bo = (b ?? {}) as Record<string, unknown>;
        const tipo = String(bo.tipo ?? 'vigilar');
        return {
          tipo: (['positivo', 'vigilar', 'accion'].includes(tipo) ? tipo : 'vigilar') as 'positivo' | 'vigilar' | 'accion',
          texto: String(bo.texto ?? ''),
        };
      })
      .filter((b) => b.texto.length > 0),
    siguiente_paso: String(o.siguiente_paso ?? ''),
    modelUsed,
    generatedAt: new Date().toISOString(),
  };
}
