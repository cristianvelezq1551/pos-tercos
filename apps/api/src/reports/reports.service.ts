import { Injectable } from '@nestjs/common';
import { computeCashierBaseline, flagsForShift } from '@pos-tercos/domain';
import type { CashierAnomalyBaseline, ShiftAnomalySample } from '@pos-tercos/domain';
import type {
  CashierAnomalies,
  CashierBaseline,
  DigitalCountLine,
  ShiftMetrics,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RECENT_SHIFTS_PER_CASHIER = 30;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anomalías por cajero: qué turno se sale de lo NORMAL para esa persona.
   *
   * Lo que se mide es el descuadre TOTAL (cajón + cuenta), las anulaciones y
   * las aperturas de cajón sin venta. Lo normal y el umbral los calcula
   * `@pos-tercos/domain` — acá solo se leen los datos. Se evalúan TODOS los
   * turnos de la ventana, no solo el último.
   */
  async getAnomalies(): Promise<CashierAnomalies[]> {
    const cashiers = await this.prisma.user.findMany({
      where: { role: { in: ['CAJERO', 'ADMIN_OPERATIVO', 'DUENO'] }, active: true },
      select: { id: true, fullName: true },
    });

    const results: CashierAnomalies[] = [];
    for (const cashier of cashiers) {
      const bloque = await this.anomaliesForCashier(cashier.id, cashier.fullName);
      if (bloque) results.push(bloque);
    }
    return results;
  }

  private async anomaliesForCashier(
    cashierId: string,
    cashierName: string | null,
  ): Promise<CashierAnomalies | null> {
    const where = { cashierId, status: { in: ['CLOSED', 'RECONCILED'] } } satisfies Prisma.ShiftWhereInput;
    const [allClosed, totalShifts] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        take: RECENT_SHIFTS_PER_CASHIER,
      }),
      this.prisma.shift.count({ where }),
    ]);
    if (allClosed.length === 0) return null;

    const metrics = await Promise.all(
      allClosed.map((s) => this.computeShiftMetrics(s.id, cashierId, s.openedAt, s.closedAt)),
    );

    const muestras = metrics.map(toSample);
    const baseline = computeCashierBaseline(muestras);
    if (baseline) {
      metrics.forEach((m, i) => {
        m.flags = flagsForShift(muestras[i]!, baseline);
      });
    }

    return {
      cashierId,
      cashierName,
      totalShifts,
      baseline: baseline ? toBaselineDto(baseline, metrics) : null,
      shifts: metrics,
    };
  }

  private async computeShiftMetrics(
    shiftId: string,
    cashierId: string,
    openedAt: Date,
    closedAt: Date | null,
  ): Promise<ShiftMetrics> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { difference: true, digitalCountBreakdown: true },
    });

    const [voidCount, noSaleCount] = await Promise.all([
      this.prisma.sale.count({
        where: { shiftId, status: 'VOID' },
      }),
      this.prisma.auditLog.count({
        where: {
          userId: cashierId,
          action: 'CASH_DRAWER_OPENED_NO_SALE',
          createdAt: {
            gte: openedAt,
            ...(closedAt ? { lte: closedAt } : {}),
          },
        },
      }),
    ]);

    const difference =
      shift?.difference !== null && shift?.difference !== undefined
        ? Number(shift.difference)
        : null;
    const digitalDifference = sumArqueoDigital(
      (shift?.digitalCountBreakdown as DigitalCountLine[] | null) ?? null,
    );

    return {
      shiftId,
      openedAt: openedAt.toISOString(),
      closedAt: closedAt?.toISOString() ?? null,
      difference,
      digitalDifference,
      totalDifference:
        difference === null || digitalDifference === null ? null : difference + digitalDifference,
      voidCount,
      noSaleCount,
      flags: [],
    };
  }
}

/**
 * Descuadre de la cuenta. Null si algún medio quedó SIN arquear: ahí no se
 * sabe cuánto fue y darlo por cero daría por bueno un turno que nadie revisó.
 * Sin medios digitales en el turno, el descuadre de la cuenta es 0.
 */
function toSample(m: ShiftMetrics): ShiftAnomalySample {
  return {
    totalDifference: m.totalDifference ?? null,
    voidCount: m.voidCount,
    noSaleCount: m.noSaleCount,
  };
}

function sumArqueoDigital(lines: DigitalCountLine[] | null): number | null {
  if (!lines || lines.length === 0) return 0;
  if (lines.some((d) => d.difference === null || d.difference === undefined)) return null;
  return lines.reduce((acc, d) => acc + (d.difference ?? 0), 0);
}

/**
 * Lo que viaja a la pantalla. `typical*`/`threshold*` es lo que se usa hoy;
 * `avg*`/`std*` son descriptivos y se conservan porque una versión previa del
 * admin los exige mientras se despliega (API y admin salen por separado).
 */
function toBaselineDto(
  base: CashierAnomalyBaseline,
  metrics: readonly ShiftMetrics[],
): CashierBaseline {
  const diffs = metrics
    .filter((m) => m.totalDifference !== null && m.totalDifference !== undefined)
    .map((m) => Math.abs(m.totalDifference as number));
  const [avgDiff, stdDiff] = avgStd(diffs);
  const [avgVoids, stdVoids] = avgStd(metrics.map((m) => m.voidCount));
  const [avgNoSale, stdNoSale] = avgStd(metrics.map((m) => m.noSaleCount));
  return { ...base, avgDiff, stdDiff, avgVoids, stdVoids, avgNoSale, stdNoSale };
}

function avgStd(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / values.length;
  return [round(avg), round(Math.sqrt(variance))];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
