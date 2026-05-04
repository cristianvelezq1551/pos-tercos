import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CreateWebOrder, PublicWebOrder, Sale } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { PosGateway } from './pos.gateway';

@Injectable()
export class WebOrdersService {
  private readonly logger = new Logger(WebOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => PosGateway))
    private readonly posGateway: PosGateway,
  ) {}

  /**
   * Crea una venta WEB_PICKUP o WEB_DELIVERY en estado PENDIENTE_PAGO.
   * Reusa SalesService.create (que ya valida productos, calcula totales,
   * aplica promos y soporta idempotency-key). El cajero/admin que
   * "crea" la venta es null (público), por eso pasamos un user "system"
   * o el id del primer DUEÑO encontrado.
   *
   * NOTA: la sale.cashierId queda en null hasta que el cajero confirme
   * el pago — eso ya está modelado en el schema (cashier_id nullable).
   */
  async create(input: CreateWebOrder, idempotencyKey?: string): Promise<PublicWebOrder> {
    // SalesService.create necesita un userId. Para ventas web, usamos el
    // primer DUEÑO como "system user" — no afecta cashierId/paidByUserId
    // (ambos quedan null hasta confirmPayment).
    const systemUser = await this.prisma.user.findFirst({
      where: { role: 'DUENO' },
      select: { id: true },
    });
    if (!systemUser) {
      throw new Error('No DUENO user found to act as system creator for web orders');
    }

    const sale = await this.sales.create(
      {
        type: input.type,
        items: input.items,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.type === 'WEB_DELIVERY' ? input.deliveryAddress : undefined,
        notes: input.notes,
      },
      systemUser.id,
      idempotencyKey,
    );

    const dto = this.toPublicDto(sale, null);
    this.posGateway.emit('web-order.created', dto);
    return dto;
  }

  /** Lectura pública (con token). Devuelve solo campos seguros. */
  async getPublic(saleId: string): Promise<PublicWebOrder> {
    const sale = await this.sales.getById(saleId);
    if (sale.type === 'COUNTER') {
      throw new NotFoundException(`Sale ${saleId} no es una orden web`);
    }
    const customerPaidAt = await this.readCustomerPaidAt(saleId);
    return this.toPublicDto(sale, customerPaidAt);
  }

  /**
   * Cliente clickea "ya pagué". Esto NO cambia el status de la sale.
   * Solo:
   *  1. Inserta entrada en audit con action SALE_STATUS_CHANGED + metadata
   *     `{stage: 'customer-paid-claimed', reference}` (reusamos el enum
   *     existente para no tocar migration en este sprint).
   *  2. Lee el momento de la "afirmación" para retornarlo en el GET.
   *  3. (7.B) Emite WS al POS para notificar al cajero.
   */
  async markPaid(saleId: string, reference: string | undefined): Promise<PublicWebOrder> {
    const sale = await this.sales.getById(saleId);
    if (sale.type === 'COUNTER') {
      throw new NotFoundException(`Sale ${saleId} no es una orden web`);
    }
    if (sale.status !== 'PENDIENTE_PAGO') {
      throw new NotFoundException(
        `Sale ${saleId} no está en PENDIENTE_PAGO (status=${sale.status})`,
      );
    }

    await this.audit.log({
      userId: null,
      action: 'SALE_STATUS_CHANGED',
      entityType: 'sale',
      entityId: saleId,
      metadata: { stage: 'customer-paid-claimed', reference: reference ?? null },
    });

    const customerPaidAt = await this.readCustomerPaidAt(saleId);
    const dto = this.toPublicDto(sale, customerPaidAt);
    this.posGateway.emit('web-order.customer-paid', dto);
    return dto;
  }

  private async readCustomerPaidAt(saleId: string): Promise<string | null> {
    const candidates = await this.prisma.auditLog.findMany({
      where: { entityId: saleId, action: 'SALE_STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { metadata: true, createdAt: true },
    });
    for (const c of candidates) {
      const m = c.metadata as { stage?: unknown } | null;
      if (m && typeof m === 'object' && m.stage === 'customer-paid-claimed') {
        return c.createdAt.toISOString();
      }
    }
    return null;
  }

  private toPublicDto(sale: Sale, customerPaidAt: string | null): PublicWebOrder {
    if (sale.type === 'COUNTER') {
      throw new Error('Cannot serialize COUNTER sale as PublicWebOrder');
    }
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      type: sale.type,
      status: sale.status,
      customerName: sale.customerName ?? '',
      customerPhone: sale.customerPhone ?? '',
      deliveryAddress: sale.deliveryAddress,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      createdAt: sale.createdAt,
      customerPaidAt,
    };
  }
}
