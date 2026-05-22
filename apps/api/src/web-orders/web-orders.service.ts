import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateWebOrder, PublicWebOrder, Sale } from '@pos-tercos/types';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { PosGateway } from './pos.gateway';

@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly notifications: NotificationService,
    @Inject(forwardRef(() => PosGateway))
    private readonly posGateway: PosGateway,
  ) {}

  /**
   * Crea una venta WEB_PICKUP en estado PENDIENTE_PAGO.
   * Reusa SalesService.create (que ya valida productos, calcula totales,
   * aplica promos y soporta idempotency-key). El cashierId queda en null
   * hasta que el cajero confirme el pago vía POS.
   */
  async create(input: CreateWebOrder, idempotencyKey?: string): Promise<PublicWebOrder> {
    // SalesService.create necesita un userId. Para ventas web, usamos el
    // primer DUENO como "system user" — no afecta cashierId/paidByUserId
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
        notes: input.notes,
      },
      systemUser.id,
      idempotencyKey,
    );

    const dto = this.toPublicDto(sale);
    this.posGateway.emit('web-order.created', dto);
    // El cliente recibe las instrucciones de pago apenas crea el pedido
    // (Nequi/transferencia + total + "enviá comprobante"). Fire-and-forget +
    // idempotente por flag: no bloquea la creación ni reenvía en reintentos.
    void this.notifications.notify(sale.id, 'payment_instructions');
    return dto;
  }

  /** Lectura pública (con token). Devuelve solo campos seguros. */
  async getPublic(saleId: string): Promise<PublicWebOrder> {
    const sale = await this.sales.getById(saleId);
    if (sale.type === 'COUNTER') {
      throw new NotFoundException(`Sale ${saleId} no es una orden web`);
    }
    return this.toPublicDto(sale);
  }

  // Flujo cajero-driven: el cliente nunca afirma pago. El cajero acepta
  // (instrucciones por WhatsApp/OpenWA), verifica el comprobante y confirma
  // el pago desde POS.

  private toPublicDto(sale: Sale): PublicWebOrder {
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
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      createdAt: sale.createdAt,
    };
  }
}
