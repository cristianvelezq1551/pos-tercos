import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { haversineKm, type GeoPoint } from '@pos-tercos/domain';
import type { CreateWebOrder, PublicWebOrder, Sale } from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { PosGateway } from './pos.gateway';

const DEFAULT_RADIUS_KM = 3;

@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
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

    // FASE 8: validación 3km en backend (defensa en profundidad — el cliente
    // ya filtró en /web/geocode pero re-validamos por si manipuló el body).
    if (input.type === 'WEB_DELIVERY') {
      const origin: GeoPoint = {
        lat: Number(process.env.RESTAURANT_LAT ?? '4.6533'),
        lng: Number(process.env.RESTAURANT_LNG ?? '-74.0836'),
      };
      const radiusKm = Number(
        process.env.RESTAURANT_DELIVERY_RADIUS_KM ?? DEFAULT_RADIUS_KM,
      );
      // El Zod superRefine ya garantiza que lat/lng están definidos.
      const point: GeoPoint = { lat: input.deliveryLat!, lng: input.deliveryLng! };
      const distanceKm = haversineKm(origin, point);
      if (distanceKm > radiusKm) {
        throw new BadRequestException(
          `Esta dirección está a ${distanceKm.toFixed(2)} km del local — fuera del radio de delivery (${radiusKm} km). Usá pickup o cambiá la dirección.`,
        );
      }
    }

    const sale = await this.sales.create(
      {
        type: input.type,
        items: input.items,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.type === 'WEB_DELIVERY' ? input.deliveryAddress : undefined,
        deliveryLat: input.type === 'WEB_DELIVERY' ? input.deliveryLat : undefined,
        deliveryLng: input.type === 'WEB_DELIVERY' ? input.deliveryLng : undefined,
        notes: input.notes,
      },
      systemUser.id,
      idempotencyKey,
    );

    const dto = this.toPublicDto(sale);
    this.posGateway.emit('web-order.created', dto);
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

  // FASE 14.A — markPaid + readCustomerPaidAt removidos. El flujo es
  // cajero-driven via wa.me desde FASE 9: el cliente nunca afirma pago,
  // el cajero lo verifica en WhatsApp y confirma desde POS.

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
      deliveryAddress: sale.deliveryAddress,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      total: sale.total,
      createdAt: sale.createdAt,
    };
  }
}
