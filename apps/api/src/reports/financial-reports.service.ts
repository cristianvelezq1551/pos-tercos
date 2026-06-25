import { Injectable, Logger } from '@nestjs/common';
import {
  FINANCIAL_ANALYSIS_SYSTEM,
  buildFinancialAnalysisUserPrompt,
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
    // Ventana del "mes del negocio": arranca el día de corte configurable y
    // termina el día anterior al corte del mes siguiente. startDay=1 reduce al
    // mes calendario exacto (comportamiento por defecto).
    const startDay = await this.businessConfig.getMonthStartDay();
    const monthStart = new Date(Date.UTC(year, month0, startDay));
    const monthEnd = new Date(Date.UTC(year, month0 + 1, startDay - 1, 23, 59, 59, 999));

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
      });
    }
    for (const c of otherCosts) {
      fixedCostLines.push({
        fixedCostId: c.id,
        name: c.name,
        category: c.category,
        monthlyAmount: round(c.monthlyAmount),
        isPayroll: false,
      });
    }
    const totalFixed = round(fixedCostLines.reduce((a, l) => a + l.monthlyAmount, 0));
    const netResult = round(grossMargin - totalFixed);

    // Break-even = costos fijos / margen bruto %. Solo válido si hay margen %.
    let breakEven: number | null = null;
    let breakEvenCoverage: number | null = null;
    if (grossMarginPct > 0) {
      breakEven = round(totalFixed / grossMarginPct);
      breakEvenCoverage = breakEven > 0 ? revenue / breakEven : null;
    }

    return {
      year,
      month: month1,
      monthLabel: `${MONTHS_ES[month0]} ${year}`,
      periodStart: ymd(monthStart),
      periodEnd: ymd(monthEnd),
      revenue: round(revenue),
      cogs: round(cogs),
      grossMargin: round(grossMargin),
      grossMarginPct: round4(grossMarginPct),
      fixedCosts: fixedCostLines,
      totalFixed,
      netResult,
      breakEven,
      breakEvenCoverage: breakEvenCoverage === null ? null : round4(breakEvenCoverage),
    };
  }

  /** Tendencia de los últimos `n` meses incluyendo el actual. */
  async getMonthlyTrend(n: number, refYear?: number, refMonth1?: number): Promise<MonthlyTrend> {
    const ref = refYear !== undefined && refMonth1 !== undefined
      ? { year: refYear, month0: refMonth1 - 1 }
      : (() => {
          const now = new Date();
          return { year: now.getUTCFullYear(), month0: now.getUTCMonth() };
        })();

    const months: Array<{ year: number; month1: number }> = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(ref.year, ref.month0 - i, 1));
      months.push({ year: d.getUTCFullYear(), month1: d.getUTCMonth() + 1 });
    }

    const points: MonthlyTrendPoint[] = [];
    for (const m of months) {
      const s = await this.getMonthlyStatement(m.year, m.month1);
      points.push({
        year: s.year,
        month: s.month,
        monthLabel: s.monthLabel,
        revenue: s.revenue,
        cogs: s.cogs,
        totalFixed: s.totalFixed,
        netResult: s.netResult,
      });
    }
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
   * Suma el costo de nómina del mes calendario. Espeja la lógica semanal de
   * `WorkersService.computeBase`: MONTHLY = tasa diaria (salary*12/365) por
   * días empleados; DAILY = suma de días no-descanso, aplicando overrides.
   * Las novedades cuyo lunes (periodStart) cae dentro del mes se suman.
   */
  private async computePayrollForRange(monthStart: Date, monthEnd: Date): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        payType: { not: null },
        hireDate: { lte: monthEnd },
        OR: [{ terminationDate: null }, { terminationDate: { gte: monthStart } }],
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
      total += await this.computeMonthlyBase(u, monthStart, monthEnd);
      // Novedades cuyo lunes (periodStart) cae dentro del mes calendario.
      const adjs = await this.prisma.payrollAdjustment.findMany({
        where: { userId: u.id, periodStart: { gte: monthStart, lte: monthEnd } },
        select: { amount: true },
      });
      for (const a of adjs) total += Number(a.amount);
    }
    return total;
  }

  /** Base del mes — mirror de `WorkersService.computeBase` sobre el rango completo. */
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
    const DAY_MS = 86_400_000;
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
    // DAILY: suma por día, saltando descansos cíclicos. Override gana siempre.
    const restSet = new Set(user.restDaysOfWeek);
    const overrides = await this.prisma.payrollDay.findMany({
      where: { userId: user.id, workDate: { gte: effStart, lte: effEnd } },
      select: { workDate: true, amount: true },
    });
    const ovMap = new Map(
      overrides.map((o) => [o.workDate.toISOString().slice(0, 10), Number(o.amount)]),
    );
    let base = 0;
    for (let t = effStart.getTime(); t <= effEnd.getTime(); t += DAY_MS) {
      const d = new Date(t);
      const ov = ovMap.get(d.toISOString().slice(0, 10));
      if (ov !== undefined) {
        base += ov;
        continue;
      }
      if (restSet.has(d.getUTCDay())) continue;
      base += salary;
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
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    throw new Error('La IA no devolvió un JSON válido. Probá de nuevo.');
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
