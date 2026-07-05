import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Un cobro COUNTER abandonado más allá de esto es basura, no una venta en
 * curso (el cobro real toma segundos; el modal cancela al cerrarse — esto
 * cubre navegador muerto, corte de luz, red caída en el cancel).
 */
const STALE_AFTER_MINUTES = 30;

/**
 * Barrido de ventas PENDIENTE_PAGO huérfanas. Desde que el POS crea la
 * venta al ABRIR el cobro (para la comanda), un navegador que muere antes
 * de confirmar deja la venta colgada: el `cancelSale` del cierre del modal
 * es best-effort. No afectan caja ni reportes (los pendientes se excluyen),
 * pero ensucian el Historial para siempre. Solo COUNTER — los pedidos WEB
 * pendientes son clientes que aún pueden pagar (los rechaza el cajero).
 */
@Injectable()
export class StaleSalesSweepService {
  private readonly logger = new Logger(StaleSalesSweepService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepScheduled(): Promise<void> {
    // Guard de re-entrada: si un barrido lento todavía corre, no lo solapamos
    // (@nestjs/schedule no lo impide solo).
    if (this.running) {
      this.logger.warn('sweep anterior aún en curso — se omite este tick');
      return;
    }
    this.running = true;
    try {
      await this.sweep();
    } catch (err) {
      // El cron nunca debe tumbar el proceso por un barrido fallido.
      this.logger.error(`sweep de pendientes huérfanas falló: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /** Llamado por el cron y por el endpoint manual del Dueño. */
  async sweep(): Promise<{ canceled: number }> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000);
    const stale = await this.prisma.sale.findMany({
      where: {
        type: 'COUNTER',
        status: 'PENDIENTE_PAGO',
        createdAt: { lt: cutoff },
        // Cuentas abiertas (#3): viven sin pagar a propósito — NUNCA barrerlas.
        isOpenTab: false,
      },
      select: { id: true, receiptNumber: true, createdAt: true },
    });
    if (stale.length === 0) return { canceled: 0 };

    let canceled = 0;
    for (const sale of stale) {
      // Guard por venta: si justo la están cobrando, el updateMany no matchea
      // y se salta sin romper el cobro en curso.
      const updated = await this.prisma.$transaction(async (tx) => {
        const res = await tx.sale.updateMany({
          where: { id: sale.id, status: 'PENDIENTE_PAGO' },
          data: { status: 'CANCELADO_NO_PAGO' },
        });
        if (res.count === 0) return false;
        await tx.saleStatusLog.create({
          data: {
            saleId: sale.id,
            statusFrom: 'PENDIENTE_PAGO',
            statusTo: 'CANCELADO_NO_PAGO',
            userId: null,
            notes: `Cobro abandonado — barrido automático (>${STALE_AFTER_MINUTES} min sin confirmar)`,
          },
        });
        return true;
      });
      if (updated) canceled += 1;
    }

    if (canceled > 0) {
      this.logger.warn(`${canceled} venta(s) PENDIENTE_PAGO huérfanas canceladas`);
      await this.audit.log({
        userId: null,
        action: 'STALE_SALES_SWEPT',
        entityType: 'sale',
        metadata: {
          canceled,
          staleAfterMinutes: STALE_AFTER_MINUTES,
          receiptNumbers: stale.slice(0, 20).map((s) => Number(s.receiptNumber)),
        },
      });
    }
    return { canceled };
  }
}
