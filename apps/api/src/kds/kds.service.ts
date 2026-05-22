import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Sale, SaleStatus } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicDisplayService } from '../public-display/public-display.service';
import { SalesService } from '../sales/sales.service';

const KITCHEN_QUEUE_STATUSES = ['PAGADO', 'EN_PREPARACION'] as const satisfies readonly SaleStatus[];

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
    private readonly publicDisplay: PublicDisplayService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Cola de cocina: pedidos PAGADO (esperando) + EN_PREPARACION (en curso).
   * Ordenados por paidAt ascendente (FIFO). LISTO_DESPACHO sale del queue.
   */
  async getQueue(): Promise<Sale[]> {
    const [paid, inProgress] = await Promise.all([
      this.sales.list({ status: 'PAGADO', limit: 100 }),
      this.sales.list({ status: 'EN_PREPARACION', limit: 100 }),
    ]);
    const merged = [...paid, ...inProgress];
    merged.sort((a, b) => {
      const aTs = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bTs = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return aTs - bTs;
    });
    return merged;
  }

  /** PAGADO → EN_PREPARACION. */
  async start(saleId: string, userId: string): Promise<Sale> {
    return this.transition(saleId, 'PAGADO', 'EN_PREPARACION', userId);
  }

  /** EN_PREPARACION → LISTO_DESPACHO. */
  async ready(saleId: string, userId: string): Promise<Sale> {
    const sale = await this.transition(saleId, 'EN_PREPARACION', 'LISTO_DESPACHO', userId);
    void this.notifications.notify(saleId, 'pickup_ready');
    return sale;
  }

  private async transition(
    saleId: string,
    from: SaleStatus,
    to: SaleStatus,
    userId: string,
  ): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (existing.status !== from) {
      throw new BadRequestException(
        `Sale en status ${existing.status}, esperaba ${from} para transición a ${to}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: { status: to },
      });
      await tx.saleStatusLog.create({
        data: { saleId, statusFrom: from, statusTo: to, userId },
      });
    });

    await this.audit.log({
      userId,
      action: 'SALE_STATUS_CHANGED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { from, to, by: 'kds' },
    });

    const sale = await this.sales.getById(saleId);
    if (sale.type === 'COUNTER') {
      this.publicDisplay.notify();
    }
    return sale;
  }

  /** Subset estatuses que el KDS reconoce. */
  static readonly QUEUE_STATUSES = KITCHEN_QUEUE_STATUSES;
}
