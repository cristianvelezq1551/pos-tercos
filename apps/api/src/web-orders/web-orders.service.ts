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
import { AddressTokenService } from './address-token.service';
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
    private readonly addressTokens: AddressTokenService,
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
        'Los pedidos web están temporalmente deshabilitados. Puedes pedir en el local.',
      );
    }
    throw new ServiceUnavailableException(
      state.nextOpenAt
        ? `Estamos cerrados en este momento. Abrimos ${formatOpeningMoment(new Date(state.nextOpenAt))}.`
        : 'Estamos cerrados en este momento.',
    );
  }

  /**
   * Zona de cobertura del domicilio.
   *
   * La ubicación que se mide es la de la DIRECCIÓN elegida, no la del teléfono:
   * viene dentro de `addressToken`, un sobre que firmó el server al resolverla.
   * Antes se medía el GPS del navegador, que responde "dónde está el cliente
   * ahora" —no "a dónde va la comida"— y además se podía falsear editando el
   * body.
   *
   * Con `ordersRespectRadius` activo el token es OBLIGATORIO: sin poder ubicar
   * la dirección no hay forma de sostener el rechazo, y aceptar "por las dudas"
   * volvería el candado decorativo. Con el switch apagado se acepta igual (el
   * dueño todavía no quiere rechazar a nadie).
   *
   * 400 y no 503: el problema es el pedido (de dónde viene), no el servicio.
   * El 503 dice "volvé más tarde"; estar lejos no se arregla esperando.
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
        'Por ahora no hacemos domicilios. Puedes pedir para recoger en el local.',
      );
    }
    if (!config.ordersRespectRadius) return;

    const verified = input.addressToken
      ? this.addressTokens.verify(input.addressToken)
      : null;
    if (!verified) {
      throw new BadRequestException(
        'Elige tu dirección de la lista de sugerencias para que podamos verificar que llegamos hasta allá.',
      );
    }

    const { inRange, distanceKm, radiusKm } = await this.businessConfig.checkRadius({
      lat: verified.lat,
      lng: verified.lng,
    });
    if (inRange) return;
    throw new BadRequestException(
      distanceKm === null
        ? `No pudimos ubicar esa dirección dentro de nuestra zona (llegamos hasta ${radiusKm} km del local).`
        : `Esa dirección está a ${distanceKm.toFixed(1)} km y llegamos hasta ${radiusKm} km del local.`,
    );
  }

  /**
   * Coordenadas que se guardan con la venta (para abrir el mapa desde la caja).
   * Manda la dirección verificada; el GPS del navegador es el respaldo cuando
   * el radio está apagado y no hubo token.
   */
  private deliveryCoords(input: CreateWebOrder): { lat?: number; lng?: number } {
    if (input.type !== 'WEB_DELIVERY') return {};
    const verified = input.addressToken
      ? this.addressTokens.verify(input.addressToken)
      : null;
    if (verified) return { lat: verified.lat, lng: verified.lng };
    return { lat: input.customerLat, lng: input.customerLng };
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
        'Ya tienes varios pedidos sin pagar hoy con este número. Paga o espera a que el local los procese antes de pedir de nuevo.',
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
        // Coordenadas de la DIRECCIÓN verificada (o el GPS como respaldo):
        // sirven para abrir el mapa desde la caja. El texto que escribió el
        // cliente sigue siendo la guía del repartidor — "torre 2, apto 502"
        // no está en ninguna coordenada.
        ...(() => {
          const c = this.deliveryCoords(input);
          return { deliveryLat: c.lat, deliveryLng: c.lng };
        })(),
      },
      systemUser.id,
      idempotencyKey,
    );

    const dto = this.toPublicDto(sale);
    this.posGateway.emit('web-order.created', dto);
    // Instrucciones de pago apenas se crea el pedido... EXCEPTO a domicilio: ahí
    // el total todavía NO es real (falta el envío, que el cajero pregunta al
    // domiciliario). Mandarlo ahora sería darle un número que va a cambiar; sale
    // en `setDeliveryFee`. Fire-and-forget + idempotente por flag.
    if (sale.type !== 'WEB_DELIVERY') {
      void this.notifications.notify(sale.id, 'payment_instructions');
    }
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
  // (instrucciones por WhatsApp), verifica el comprobante y confirma
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
      deliveryFee: sale.deliveryFee,
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
