import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import type { CreateWebOrder, PublicWebOrder, Sale } from '@pos-tercos/types';
import { BusinessConfigService } from '../business-config/business-config.service';
import { formatOpeningMoment } from './format-opening';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { PosGateway } from './pos.gateway';

/**
 * Anti-abuso (#13): máx pedidos PENDIENTES por teléfono por día. El endpoint
 * es público y cada pedido dispara un WhatsApp pago → sin tope, un abusador
 * genera costo + pedidos basura. 3 pendientes simultáneos del mismo número en
 * un día no es un cliente real (los pagados no cuentan: quien paga puede
 * seguir pidiendo).
 */
const MAX_PENDING_WEB_ORDERS_PER_PHONE_PER_DAY = 3;

@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly notifications: NotificationService,
    private readonly businessConfig: BusinessConfigService,
    @Inject(forwardRef(() => PosGateway))
    private readonly posGateway: PosGateway,
  ) {}

  /**
   * ¿Se puede pedir ahora? Dos motivos para decir que no:
   *  - Kill-switch (#13): el dueño apagó los pedidos web.
   *  - Fuera de horario, si el dueño prendió `ordersRespectSchedule`.
   *
   * Va en el SERVER, no solo en la web: sin esto el gate sería decorativo
   * (cualquiera postea al endpoint público). La regla sale de
   * `getOrderingState` — la misma que alimenta el `acceptingOrders` que ve la
   * web, para que no puedan divergir.
   *
   * 503 y no 400 a propósito: es indisponibilidad temporal y esperada, y el
   * `ServerErrorAlertFilter` ignora los 5xx que no son 500 → no le llega un
   * WhatsApp de "error del sistema" al dueño cada vez que alguien pide cerrado.
   */
  private async assertAcceptingOrders(): Promise<void> {
    const state = await this.businessConfig.getOrderingState();
    if (state.accepting) return;
    if (state.reason === 'orders_disabled') {
      throw new ServiceUnavailableException(
        'Los pedidos web están temporalmente deshabilitados. Podés pedir en el local.',
      );
    }
    throw new ServiceUnavailableException(
      state.nextOpenAt
        ? `Estamos cerrados en este momento. Abrimos ${formatOpeningMoment(new Date(state.nextOpenAt))}.`
        : 'Estamos cerrados en este momento.',
    );
  }

  /**
   * Zona de cobertura. Si el cliente no mandó ubicación (negó el permiso del
   * GPS) NO se bloquea — decisión del dueño: el radio es un filtro, no un
   * candado, y el permiso se puede negar desde cualquier navegador.
   *
   * 400 y no 503: acá el problema es el pedido (de dónde viene), no el
   * servicio. El 503 dice "volvé más tarde"; estar lejos no se arregla
   * esperando.
   */
  private async assertInRange(input: CreateWebOrder): Promise<void> {
    // El radio es la ZONA DE COBERTURA del domicilio: solo aplica a WEB_DELIVERY.
    // A quien viene a recoger no se le bloquea por vivir lejos — maneja hasta acá.
    if (input.type !== 'WEB_DELIVERY') return;

    // El dueño puede no repartir todavía. La web no ofrece la opción, pero el
    // endpoint es público: sin este guard, un POST directo colaría el domicilio.
    const config = await this.businessConfig.get();
    if (!config.deliveryEnabled) {
      throw new BadRequestException(
        'Por ahora no hacemos domicilios. Podés pedir para recoger en el local.',
      );
    }

    const customer =
      input.customerLat !== undefined && input.customerLng !== undefined
        ? { lat: input.customerLat, lng: input.customerLng }
        : null;
    const { inRange, distanceKm, radiusKm } = await this.businessConfig.checkRadius(customer);
    if (inRange) return;
    throw new BadRequestException(
      `Estás fuera de nuestra zona de cobertura (${distanceKm!.toFixed(1)} km). Llegamos hasta ${radiusKm} km del local.`,
    );
  }

  /**
   * Crea una venta WEB_PICKUP en estado PENDIENTE_PAGO.
   * Reusa SalesService.create (que ya valida productos, calcula totales,
   * aplica promos y soporta idempotency-key). El cashierId queda en null
   * hasta que el cajero confirme el pago vía POS.
   */
  async create(input: CreateWebOrder, idempotencyKey?: string): Promise<PublicWebOrder> {
    await this.assertAcceptingOrders();
    await this.assertInRange(input);
    // #13 tope por teléfono: N pendientes del día bloquean el siguiente.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const pendingToday = await this.prisma.sale.count({
      where: {
        // Ambos tipos web: el tope es por teléfono, no por modalidad — si no,
        // alternando recoger/domicilio se duplicaría el cupo.
        type: { in: ['WEB_PICKUP', 'WEB_DELIVERY'] },
        status: 'PENDIENTE_PAGO',
        customerPhone: input.customerPhone,
        createdAt: { gte: startOfToday },
      },
    });
    if (pendingToday >= MAX_PENDING_WEB_ORDERS_PER_PHONE_PER_DAY) {
      throw new BadRequestException(
        'Ya tenés varios pedidos sin pagar hoy con este número. Pagá o esperá a que el local los procese antes de pedir de nuevo.',
      );
    }
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
        deliveryAddress: input.deliveryAddress,
        deliveryNotes: input.deliveryNotes,
        // El GPS del pedido queda guardado con la venta: sirve para abrir el
        // mapa desde el POS. La dirección escrita sigue siendo la que manda.
        deliveryLat: input.customerLat,
        deliveryLng: input.customerLng,
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
      // El cliente ve a dónde se entrega para poder corregirlo por WhatsApp
      // antes de que salga el repartidor.
      deliveryAddress: sale.deliveryAddress ?? null,
      deliveryNotes: sale.deliveryNotes ?? null,
      createdAt: sale.createdAt,
      items: (sale.items ?? []).map((it) => ({
        productName: it.productName ?? 'Producto',
        sizeName: it.sizeName ?? null,
        quantity: it.quantity,
        modifiers: (it.modifiers ?? []).map((m) => m.name),
        notes: it.notes ?? null,
        lineTotal: it.lineTotal,
      })),
    };
  }
}
