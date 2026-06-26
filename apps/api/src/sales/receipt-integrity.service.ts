import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

interface SequenceCheckRow {
  total_sales: bigint;
  min_receipt: bigint | null;
  max_receipt: bigint | null;
  expected_count: bigint | null;
  gap_count: bigint;
}

/**
 * Detecta saltos en la sequence `receipt_seq`. Postgres puede consumir
 * receipt_numbers que después se rollback (CHECK constraint failed,
 * transaction abortada, etc.) — el number queda "saltado" en la sequence
 * pero no aparece en sales. Usamos esto como indicador de salud:
 *
 *   gap = (MAX(receipt_number) - MIN(receipt_number) + 1) - COUNT(*)
 *
 * Si gap > 0, alguna venta falló a mitad de creación. Audit con
 * `RECEIPT_GAP_DETECTED` y métricas. El Dueño puede investigar revisando
 * audit_log alrededor del momento del salto.
 *
 * Cron diario 4:00 AM (después del cleanup de idempotency a las 3 AM).
 */
@Injectable()
export class ReceiptIntegrityService {
  private readonly logger = new Logger(ReceiptIntegrityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async detectGapsScheduled(): Promise<void> {
    try {
      await this.detectGaps();
    } catch (err) {
      // El cron no debe propagar (detectGaps sigue lanzando para el endpoint manual).
      this.logger.error('detectGaps (cron) falló', err as Error);
    }
  }

  /**
   * Llamado por el cron y por el endpoint manual. Retorna el resumen para
   * que el caller pueda mostrarlo o loguearlo.
   */
  async detectGaps(): Promise<{
    totalSales: number;
    minReceipt: number | null;
    maxReceipt: number | null;
    gap: number;
  }> {
    const rows = await this.prisma.$queryRaw<SequenceCheckRow[]>`
      SELECT
        COUNT(*) AS total_sales,
        MIN(receipt_number) AS min_receipt,
        MAX(receipt_number) AS max_receipt,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE MAX(receipt_number) - MIN(receipt_number) + 1
        END AS expected_count,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE (MAX(receipt_number) - MIN(receipt_number) + 1) - COUNT(*)
        END AS gap_count
      FROM sales
      WHERE receipt_number IS NOT NULL
    `;
    const r = rows[0];
    const total = Number(r.total_sales);
    const min = r.min_receipt !== null ? Number(r.min_receipt) : null;
    const max = r.max_receipt !== null ? Number(r.max_receipt) : null;
    const gap = Number(r.gap_count);

    if (gap > 0) {
      this.logger.warn(
        `Receipt sequence gap detected: ${gap} missing numbers between ${min} and ${max} (${total} sales recorded)`,
      );
      await this.audit.log({
        action: 'RECEIPT_GAP_DETECTED',
        metadata: {
          totalSales: total,
          minReceipt: min,
          maxReceipt: max,
          gapCount: gap,
        },
      });
    } else {
      this.logger.debug(
        `Receipt sequence OK (${total} sales, min=${min}, max=${max}, no gaps)`,
      );
    }

    return { totalSales: total, minReceipt: min, maxReceipt: max, gap };
  }
}
