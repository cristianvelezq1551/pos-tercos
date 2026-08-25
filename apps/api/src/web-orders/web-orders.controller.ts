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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebOrderDailyLimitGuard } from './web-order-daily-limit.guard';
import {
  CreateWebOrderResponseSchema,
  CreateWebOrderSchema,
  IdempotencyKeySchema,
  IDEMPOTENCY_HEADER,
  type CreateWebOrder,
  type CreateWebOrderResponse,
  type PublicWebOrder,
} from '@pos-tercos/types';
import { buildPaymentAccountsText } from '@pos-tercos/domain';
import { Public } from '../auth/decorators/public.decorator';
import { BusinessConfigService } from '../business-config/business-config.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WebOrderTokenService } from './web-order-token.service';
import { WebOrdersService } from './web-orders.service';

@Controller('web/orders')
@Public()
export class WebOrdersController {
  constructor(
    private readonly orders: WebOrdersService,
    private readonly tokens: WebOrderTokenService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /**
   * A dónde paga el cliente, con el MISMO texto que el WhatsApp: manda la
   * config del negocio (editable en el admin) y las env vars son el respaldo.
   * Si las dos pantallas dijeran cuentas distintas, el cliente no sabría a cuál
   * transferir.
   */
  private async paymentAccountsText(): Promise<string | null> {
    const { paymentAccounts } = await this.businessConfig.get();
    const fromConfig = buildPaymentAccountsText(paymentAccounts);
    if (fromConfig) return fromConfig;
    const parts = [
      process.env.PAYMENT_INSTRUCTIONS_NEQUI,
      process.env.PAYMENT_INSTRUCTIONS_TRANSFER,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length ? parts.join('\n') : null;
  }

  /** 30 reqs / 60s por IP + tope diario de 25 pedidos por IP (anti-abuso). */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseGuards(WebOrderDailyLimitGuard)
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
      paymentInstructions: buildPaymentInstructions(order, await this.paymentAccountsText()),
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
    return {
      ...order,
      paymentInstructions: buildPaymentInstructions(order, await this.paymentAccountsText()),
    };
  }

  // Flujo cajero-driven: el cliente nunca afirma pago. Las instrucciones de pago
  // salen automáticamente al crear el pedido (WhatsApp); el cajero verifica
  // el comprobante y confirma desde el POS (/sales/:id/confirm-payment).
}

function buildPaymentInstructions(order: PublicWebOrder, accounts: string | null): string {
  const lines: string[] = [`Total a pagar: $${order.total.toLocaleString('es-CO')}`, ''];
  if (accounts) {
    lines.push('Puedes pagar a:');
    lines.push('');
    lines.push(accounts);
  } else {
    // Sin métodos configurados: mensaje GENÉRICO al cliente (nunca exponer un
    // texto de debug sobre env vars en el camino de pago).
    lines.push('Te enviaremos los datos de pago por WhatsApp.');
  }
  lines.push('');
  // Un domicilio NO se retira. Decirle "pasa a buscarlo" a quien pidió a
  // domicilio —en la pantalla donde está por transferir— es información falsa
  // en el peor momento. El WhatsApp ya bifurca; esta pantalla también.
  const cierre = order.deliveryAddress
    ? `te avisamos cuando salga hacia tu dirección.`
    : `te avisamos cuando esté lista para retirar.`;
  lines.push(
    `Te vamos a contactar por WhatsApp para pedirte el comprobante. Apenas el cajero verifique el pago, preparamos tu orden #${order.receiptNumber} y ${cierre}`,
  );
  return lines.join('\n');
}
