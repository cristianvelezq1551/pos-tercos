import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreateWebOrderResponseSchema,
  CreateWebOrderSchema,
  IdempotencyKeySchema,
  IDEMPOTENCY_HEADER,
  type CreateWebOrder,
  type CreateWebOrderResponse,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WebOrderTokenService } from './web-order-token.service';
import { WebOrdersService } from './web-orders.service';

@Controller('web/orders')
@Public()
export class WebOrdersController {
  constructor(
    private readonly orders: WebOrdersService,
    private readonly tokens: WebOrderTokenService,
  ) {}

  /** 30 reqs / 60s por IP. */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post()
  async create(
    @Headers(IDEMPOTENCY_HEADER) idemKeyRaw: string | undefined,
    @Body(new ZodValidationPipe(CreateWebOrderSchema)) body: CreateWebOrder,
  ): Promise<CreateWebOrderResponse> {
    let idempotencyKey: string | undefined;
    if (idemKeyRaw) {
      const parsed = IdempotencyKeySchema.safeParse(idemKeyRaw);
      if (!parsed.success) {
        throw new BadRequestException('Idempotency-Key inválida');
      }
      idempotencyKey = parsed.data;
    }

    const order = await this.orders.create(body, idempotencyKey);
    const { token, expiresAt } = this.tokens.issue(order.id);

    const payload: CreateWebOrderResponse = {
      order,
      token,
      tokenExpiresAt: expiresAt.toISOString(),
      paymentInstructions: buildPaymentInstructions(order),
    };
    return CreateWebOrderResponseSchema.parse(payload);
  }

  /** 120 reqs / 60s por IP — el cliente puede polling el status. */
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
  ): Promise<PublicWebOrder> {
    if (!token) throw new BadRequestException('token query param required');
    this.tokens.verify(token, id);
    const order = await this.orders.getPublic(id);
    return { ...order, paymentInstructions: buildPaymentInstructions(order) };
  }

  // Flujo cajero-driven: el cliente nunca afirma pago. Las instrucciones de pago
  // salen automáticamente al crear el pedido (WhatsApp/OpenWA); el cajero verifica
  // el comprobante y confirma desde el POS (/sales/:id/confirm-payment).
}

function buildPaymentInstructions(order: PublicWebOrder): string {
  const nequi = process.env.PAYMENT_INSTRUCTIONS_NEQUI ?? '';
  const transfer = process.env.PAYMENT_INSTRUCTIONS_TRANSFER ?? '';
  const lines: string[] = [`Total a pagar: $${order.total.toLocaleString('es-CO')}`, ''];
  if (nequi || transfer) {
    lines.push('Métodos disponibles:');
    if (nequi) lines.push(`• Nequi: ${nequi}`);
    if (transfer) lines.push(`• Transferencia: ${transfer}`);
  } else {
    // Sin métodos configurados: mensaje GENÉRICO al cliente (nunca exponer un
    // texto de debug sobre env vars en el camino de pago).
    lines.push('Te enviaremos los datos de pago por WhatsApp.');
  }
  lines.push('');
  lines.push(
    `Te vamos a contactar por WhatsApp para pedirte el comprobante. Apenas el cajero verifique el pago, preparamos tu orden #${order.receiptNumber} y te avisamos cuando esté lista para retirar.`,
  );
  return lines.join('\n');
}
