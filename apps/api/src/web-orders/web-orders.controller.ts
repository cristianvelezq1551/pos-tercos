import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
  MarkPaidSchema,
  type CreateWebOrder,
  type CreateWebOrderResponse,
  type MarkPaid,
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
    return this.orders.getPublic(id);
  }

  /** 10 reqs / 60s por IP — el cliente solo debería clickear una vez. */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':id/mark-paid')
  @HttpCode(200)
  async markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
    @Body(new ZodValidationPipe(MarkPaidSchema)) body: MarkPaid,
  ): Promise<PublicWebOrder> {
    if (!token) throw new BadRequestException('token query param required');
    this.tokens.verify(token, id);
    return this.orders.markPaid(id, body.reference);
  }
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
    `Cuando termines el pago, hacé click en "Ya pagué". Tu orden #${order.receiptNumber} se enviará a cocina apenas el cajero verifique.`,
  );
  return lines.join('\n');
}
