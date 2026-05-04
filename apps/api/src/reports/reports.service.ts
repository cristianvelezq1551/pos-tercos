import { Injectable } from '@nestjs/common';
import type {
  CashierAnomalies,
  CashierBaseline,
  ShiftAnomalyFlag,
  ShiftMetrics,
} from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';

const RECENT_SHIFTS_PER_CASHIER = 30;
const MIN_BASELINE_SAMPLE = 5; // si hay menos shifts de baseline, no se calculan flags
const SIGMA_THRESHOLD = 2;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FASE 11.D: anomalías por cajero. Para cada cajero con shifts cerrados,
   * calcula:
   *  - Baseline = media + std de los shifts previos al más reciente.
   *  - Flags = métrica del shift más reciente que excede `mean + 2σ`.
   *
   * Métricas trackeadas:
   *  - difference: |shift.difference| (descuadre absoluto)
   *  - voidCount: # sales VOID asociadas al shift
   *  - noSaleCount: # `CASH_DRAWER_OPENED_NO_SALE` por ese cajero en la
   *    ventana del shift (audit_log)
   *
   * NO calcula flags si hay <5 shifts de baseline (insuficiente sample).
   */
  async getAnomalies(): Promise<CashierAnomalies[]> {
    const cashiers = await this.prisma.user.findMany({
      where: {
        role: { in: ['CAJERO', 'ADMIN_OPERATIVO', 'DUENO'] },
        active: true,
      },
      select: { id: true, fullName: true },
    });

    const results: CashierAnomalies[] = [];
    for (const cashier of cashiers) {
      const allClosed = await this.prisma.shift.findMany({
        where: {
          cashierId: cashier.id,
          status: { in: ['CLOSED', 'RECONCILED'] },
        },
        orderBy: { openedAt: 'desc' },
        take: RECENT_SHIFTS_PER_CASHIER,
      });
      if (allClosed.length === 0) continue;

      const totalShifts = await this.prisma.shift.count({
        where: {
          cashierId: cashier.id,
          status: { in: ['CLOSED', 'RECONCILED'] },
        },
      });

      // Calcular metrics por shift en paralelo (limitado a top 30).
      const metrics: ShiftMetrics[] = await Promise.all(
        allClosed.map((s) => this.computeShiftMetrics(s.id, cashier.id, s.openedAt, s.closedAt)),
      );

      // Baseline = todos menos el más reciente (que es metrics[0] porque desc).
      const baselineSource = metrics.slice(1);
      const baseline = baselineSource.length >= MIN_BASELINE_SAMPLE
        ? computeBaseline(baselineSource)
        : null;

      // Aplicar flags al shift más reciente (metrics[0]) si hay baseline.
      if (baseline && metrics.length > 0) {
        metrics[0]!.flags = computeFlags(metrics[0]!, baseline);
      }

      results.push({
        cashierId: cashier.id,
        cashierName: cashier.fullName,
        totalShifts,
        baseline,
        shifts: metrics,
      });
    }

    return results;
  }

  private async computeShiftMetrics(
    shiftId: string,
    cashierId: string,
    openedAt: Date,
    closedAt: Date | null,
  ): Promise<ShiftMetrics> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { difference: true },
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

    return {
      shiftId,
      openedAt: openedAt.toISOString(),
      closedAt: closedAt?.toISOString() ?? null,
      difference: shift?.difference !== null && shift?.difference !== undefined
        ? Number(shift.difference)
        : null,
      voidCount,
      noSaleCount,
      flags: [],
    };
  }
}

function computeBaseline(shifts: ShiftMetrics[]): CashierBaseline {
  const diffs = shifts.map((s) => Math.abs(s.difference ?? 0));
  const voids = shifts.map((s) => s.voidCount);
  const nosale = shifts.map((s) => s.noSaleCount);
  const [avgDiff, stdDiff] = avgStd(diffs);
  const [avgVoids, stdVoids] = avgStd(voids);
  const [avgNoSale, stdNoSale] = avgStd(nosale);
  return {
    sampleSize: shifts.length,
    avgDiff,
    stdDiff,
    avgVoids,
    stdVoids,
    avgNoSale,
    stdNoSale,
  };
}

function computeFlags(shift: ShiftMetrics, baseline: CashierBaseline): ShiftAnomalyFlag[] {
  const flags: ShiftAnomalyFlag[] = [];
  const diffAbs = Math.abs(shift.difference ?? 0);
  if (diffAbs > baseline.avgDiff + SIGMA_THRESHOLD * baseline.stdDiff) {
    flags.push('diff_high');
  }
  if (shift.voidCount > baseline.avgVoids + SIGMA_THRESHOLD * baseline.stdVoids) {
    flags.push('voids_high');
  }
  if (shift.noSaleCount > baseline.avgNoSale + SIGMA_THRESHOLD * baseline.stdNoSale) {
    flags.push('noSale_high');
  }
  return flags;
}

function avgStd(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / values.length;
  return [round(avg), round(Math.sqrt(variance))];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
