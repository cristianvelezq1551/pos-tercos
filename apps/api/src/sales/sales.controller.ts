import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { DrawerOpenResult } from '@pos-tercos/domain';
import {
  APPROVAL_PIN_HEADER,
  ConfirmPaymentSchema,
  CreateSaleSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  OpenDrawerSchema,
  SaleStatusEnum,
  VoidSaleSchema,
  type ConfirmPayment,
  type CreateSale,
  type JwtAccessPayload,
  type OpenDrawer,
  type Sale,
  type SaleStatus,
  type SaleStatusLogEntry,
  type VoidSale,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CashierAccess,
  OnlyDueno,
} from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReceiptIntegrityService } from './receipt-integrity.service';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly receiptIntegrity: ReceiptIntegrityService,
  ) {}

  /**
   * Chequeo on-demand de saltos en receipt_seq. El cron corre 4:00 AM
   * todos los días, este endpoint permite invocar manualmente (Dueño).
   */
  @OnlyDueno()
  @Post('admin/check-receipt-gaps')
  async checkReceiptGaps(): Promise<{
    totalSales: number;
    minReceipt: number | null;
    maxReceipt: number | null;
    gap: number;
  }> {
    return this.receiptIntegrity.detectGaps();
  }

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

  /** El cajero rechaza un pedido web que nunca se pagó (PENDIENTE_PAGO). */
  @CashierAccess()
  @Post(':id/cancel')
  @HttpCode(200)
  cancelWebOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.sales.cancelWebOrder(id, user.sub);
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

  /**
   * Imprime/reimprime el recibo. La impresión REAL la hace el backend vía el
   * PrinterProvider (ESC/POS → print-agent → impresora térmica Neotek 58mm).
   * El POS solo dispara este endpoint; NO imprime desde el navegador (eso
   * causaba el papel infinito en la térmica). 1ra vez audita RECEIPT_PRINTED,
   * las siguientes RECEIPT_REPRINTED.
   */
  @CashierAccess()
  @Post(':id/print')
  @HttpCode(200)
  async print(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true; key: string }> {
    const result = await this.sales.printReceipt(id, user.sub);
    return { ok: true, key: result.key };
  }

  /**
   * Abre el cajón monedero asociado a una sale PAGADO. No requiere PIN
   * (el cajero puede abrir cuando hay venta confirmada).
   */
  @CashierAccess()
  @Post(':id/open-drawer')
  openDrawerWithSale(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DrawerOpenResult> {
    return this.sales.openDrawer({
      saleId: id,
      reason: null,
      cashierId: user.sub,
    });
  }

  /**
   * Apertura SIN VENTA: requiere reason + X-Approval-Pin (Admin/Dueño).
   * Audit con CASH_DRAWER_OPENED_NO_SALE + APPROVAL_GRANTED.
   */
  @CashierAccess()
  @Post('open-drawer/no-sale')
  openDrawerNoSale(
    @CurrentUser() user: JwtAccessPayload,
    @Headers(APPROVAL_PIN_HEADER) approvalPin: string | undefined,
    @Body(new ZodValidationPipe(OpenDrawerSchema)) body: OpenDrawer,
  ): Promise<DrawerOpenResult> {
    if (!approvalPin) {
      throw new ForbiddenException(
        `Header ${APPROVAL_PIN_HEADER} requerido para abrir cajón sin venta.`,
      );
    }
    return this.sales.openDrawer({
      saleId: null,
      reason: body.reason ?? null,
      cashierId: user.sub,
      approverPin: approvalPin,
    });
  }
}
