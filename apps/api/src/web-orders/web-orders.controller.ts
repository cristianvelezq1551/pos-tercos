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

  // Flujo cajero-driven: el cliente nunca afirma pago. El cajero acepta
  // el pedido (POST /sales/:id/accept → instrucciones por WhatsApp/OpenWA),
  // verifica el comprobante y confirma desde POS (/sales/:id/confirm-payment).
}

function buildPaymentInstructions(order: PublicWebOrder): string {
  const nequi = process.env.PAYMENT_INSTRUCTIONS_NEQUI ?? '';
  const transfer = process.env.PAYMENT_INSTRUCTIONS_TRANSFER ?? '';
  const lines: string[] = [
    `Total a pagar: $${order.total.toLocaleString('es-CO')}`,
    '',
    'Métodos disponibles:',
  ];
  if (nequi) lines.push(`• Nequi: ${nequi}`);
  if (transfer) lines.push(`• Transferencia: ${transfer}`);
  if (!nequi && !transfer) {
    lines.push('• Configurá PAYMENT_INSTRUCTIONS_NEQUI / PAYMENT_INSTRUCTIONS_TRANSFER en API');
  }
  lines.push('');
  lines.push(
    `Te vamos a contactar por WhatsApp para pedirte el comprobante. Tu orden #${order.receiptNumber} se enviará a cocina apenas el cajero verifique el pago.`,
  );
  return lines.join('\n');
}
