import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Sale, SaleStatus } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicDisplayService } from '../public-display/public-display.service';
import { SalesService } from '../sales/sales.service';
import { KdsGateway } from './kds.gateway';

const KITCHEN_QUEUE_STATUSES = ['PAGADO', 'EN_PREPARACION'] as const satisfies readonly SaleStatus[];

/** Si la preparación supera estos minutos, queda registrada como tardanza. */
const DELAYED_PREP_MIN = 10;

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
    private readonly gateway: KdsGateway,
    private readonly notifications: NotificationService,
    private readonly publicDisplay: PublicDisplayService,
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

  /**
   * EN_PREPARACION → LISTO_DESPACHO. `silent=true` (cajero actualizando un
   * pedido viejo de forma retroactiva) NO avisa al cliente por WhatsApp.
   */
  async ready(saleId: string, userId: string, silent = false): Promise<Sale> {
    const sale = await this.transition(saleId, 'EN_PREPARACION', 'LISTO_DESPACHO', userId);
    if (!silent) void this.notifications.notify(saleId, 'pickup_ready');
    // Tardanza: si la preparación tardó más del umbral, queda en la bitácora
    // de admin para seguimiento de eficiencia de cocina.
    const baseline = sale.paidAt ?? sale.createdAt;
    const elapsedMin = Math.floor((Date.now() - new Date(baseline).getTime()) / 60000);
    if (elapsedMin >= DELAYED_PREP_MIN) {
      void this.audit.log({
        userId,
        action: 'KDS_ORDER_DELAYED',
        entityType: 'sale',
        entityId: saleId,
        metadata: {
          elapsedMin,
          thresholdMin: DELAYED_PREP_MIN,
          turnNumber: sale.turnNumber,
          receiptNumber: sale.receiptNumber,
        },
      });
    }
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
        // readyAt sella el momento en que entra a la cola del cajero (ordena
        // la cola "listos por llamar").
        data: { status: to, ...(to === 'LISTO_DESPACHO' ? { readyAt: new Date() } : {}) },
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
    // Emit centralizado acá (no en el controller): cualquier caller de
    // start/ready dispara la actualización del board del KDS.
    this.gateway.emit('order.status.changed', sale);
    // Al quedar listo, refresca la cola "listos por llamar" del cajero.
    if (to === 'LISTO_DESPACHO') this.publicDisplay.notify();
    return sale;
  }

  /** Subset estatuses que el KDS reconoce. */
  static readonly QUEUE_STATUSES = KITCHEN_QUEUE_STATUSES;
}
