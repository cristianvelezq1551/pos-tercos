import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  APPROVAL_PIN_HEADER,
  ConfirmPaymentSchema,
  CreateSaleSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  SaleStatusEnum,
  VoidSaleSchema,
  type ConfirmPayment,
  type CreateSale,
  type JwtAccessPayload,
  type Sale,
  type SaleStatus,
  type SaleStatusLogEntry,
  type VoidSale,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @CashierAccess()
  @Post()
  async create(
    @CurrentUser() user: JwtAccessPayload,
    @Headers(IDEMPOTENCY_HEADER) idemKeyRaw: string | undefined,
    @Body(new ZodValidationPipe(CreateSaleSchema)) body: CreateSale,
  ): Promise<Sale> {
    let idempotencyKey: string | undefined;
    if (idemKeyRaw) {
      const parsed = IdempotencyKeySchema.safeParse(idemKeyRaw);
      if (!parsed.success) {
        throw new BadRequestException(
          `Idempotency-Key inválida: ${parsed.error.flatten().formErrors.join(', ')}`,
        );
      }
      idempotencyKey = parsed.data;
    }
    return this.sales.create(body, user.sub, idempotencyKey);
  }

  @CashierAccess()
  @Post(':id/confirm-payment')
  confirmPayment(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConfirmPaymentSchema)) body: ConfirmPayment,
  ): Promise<Sale> {
    return this.sales.confirmPayment(id, body, user.sub);
  }

  /**
   * Anular venta. Requiere header X-Approval-Pin con PIN de Admin/Dueño.
   */
  @CashierAccess()
  @Post(':id/void')
  voidSale(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(APPROVAL_PIN_HEADER) approvalPin: string | undefined,
    @Body(new ZodValidationPipe(VoidSaleSchema)) body: VoidSale,
  ): Promise<Sale> {
    if (!approvalPin) {
      throw new ForbiddenException(
        `Header ${APPROVAL_PIN_HEADER} requerido para anular venta.`,
      );
    }
    return this.sales.void(id, body, user.sub, approvalPin);
  }

  @CashierAccess()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('cashier_id') cashierId?: string,
    @Query('shift_id') shiftId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<Sale[]> {
    let parsedStatus: SaleStatus | undefined;
    if (status) {
      const r = SaleStatusEnum.safeParse(status);
      if (!r.success) throw new BadRequestException(`Status inválido: ${status}`);
      parsedStatus = r.data;
    }
    return this.sales.list({
      status: parsedStatus,
      cashierId,
      shiftId,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(Number(limit), 200) : undefined,
    });
  }

  @CashierAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Sale> {
    return this.sales.getById(id);
  }

  @CashierAccess()
  @Get(':id/status-log')
  getStatusLog(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleStatusLogEntry[]> {
    return this.sales.getStatusLog(id);
  }
}
