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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DrawerOpenResult } from '@pos-tercos/domain';
import {
  APPROVAL_PIN_HEADER,
  ChangeSalePaymentSchema,
  ConfirmPaymentSchema,
  CreateSaleSchema,
  EditSaleItemsSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  OpenDrawerSchema,
  SaleStatusEnum,
  SyncOfflineSaleSchema,
  VoidSaleSchema,
  type ChangeSalePayment,
  type ConfirmPayment,
  type CreateSale,
  type EditSaleItems,
  type JwtAccessPayload,
  type OpenDrawer,
  type Sale,
  type SaleStatus,
  type SaleStatusLogEntry,
  type SendToKitchenResponse,
  type SyncOfflineSale,
  type VoidSale,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CashierAccess,
  OnlyDueno,
} from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReceiptIntegrityService } from './receipt-integrity.service';
import { SalesEditService } from './sales-edit.service';
import { StaleSalesSweepService } from './stale-sales-sweep.service';
import { SalesOfflineService } from './sales-offline.service';
import { SalesReceiptService } from './sales-receipt.service';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly offline: SalesOfflineService,
    private readonly receipts: SalesReceiptService,
    private readonly receiptIntegrity: ReceiptIntegrityService,
    private readonly edits: SalesEditService,
    private readonly staleSweep: StaleSalesSweepService,
  ) {}

  /**
   * Chequeo on-demand de saltos en receipt_seq. El cron corre 4:00 AM
   * todos los días, este endpoint permite invocar manualmente (Dueño).
   */
  /** Barrido manual de cobros abandonados (el cron corre cada 10 min). */
  @OnlyDueno()
  @Post('admin/sweep-stale-pending')
  sweepStalePending(): Promise<{ canceled: number }> {
    return this.staleSweep.sweep();
  }

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

  /**
   * Sincroniza una venta cobrada OFFLINE (Fase B.3). Idempotente por localId.
   * Ruta de UN segmento ('sync-offline') → no choca con las rutas `:id/...`.
   */
  @CashierAccess()
  @Post('sync-offline')
  syncOffline(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SyncOfflineSaleSchema)) body: SyncOfflineSale,
  ): Promise<Sale> {
    return this.offline.syncOffline(body, user.sub);
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

  /** Pedido WEB pagado → "listo para retirar": dispara el WhatsApp al cliente. */
  @CashierAccess()
  @Post(':id/mark-ready')
  markReady(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.sales.markWebReady(id, user.sub);
  }

  /**
   * Anular venta. Requiere header X-Approval-Pin con PIN de Admin/Dueño.
   */
  @CashierAccess()
  @Throttle({ default: { ttl: 300_000, limit: 5 } }) // anti-brute-force del PIN
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

  /**
   * Reembolsa un pedido ya retirado/entregado (web en LISTO_DESPACHO; o
   * EN_PREPARACION/ENTREGADO históricos). No revierte stock (la comida se
   * consumió); requiere X-Approval-Pin.
   */
  @CashierAccess()
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @Post(':id/refund')
  refundSale(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(APPROVAL_PIN_HEADER) approvalPin: string | undefined,
    @Body(new ZodValidationPipe(VoidSaleSchema)) body: VoidSale,
  ): Promise<Sale> {
    if (!approvalPin) {
      throw new ForbiddenException(
        `Header ${APPROVAL_PIN_HEADER} requerido para reembolsar venta.`,
      );
    }
    return this.sales.refund(id, body, user.sub, approvalPin);
  }

  /**
   * Edita los productos de un pedido ya cobrado. Si la cocina ya lo inició,
   * solo se pueden cambiar líneas de reventa directa (ej. bebidas).
   */
  @CashierAccess()
  @Patch(':id/items')
  editItems(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EditSaleItemsSchema)) body: EditSaleItems,
  ): Promise<Sale> {
    return this.edits.editItems(id, body, user.sub);
  }

  /**
   * Reclasifica el método/división de pago de una venta cobrada (corrige un
   * registro equivocado para que el arqueo cuadre). Solo con la caja abierta.
   */
  @CashierAccess()
  @Patch(':id/payment')
  changePayment(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ChangeSalePaymentSchema)) body: ChangeSalePayment,
  ): Promise<Sale> {
    return this.edits.changePayment(id, body, user.sub);
  }

  /** Cancela un pedido que nunca se pagó (web rechazado o cobro abandonado). */
  @CashierAccess()
  @Post(':id/cancel')
  @HttpCode(200)
  cancelWebOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.sales.cancelUnpaid(id, user.sub);
  }

  /** Traspasa una cuenta abierta a la próxima caja (suelta el shiftId). */
  @CashierAccess()
  @Post(':id/carry-over')
  @HttpCode(200)
  carryOverOpenTab(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.sales.carryOverOpenTab(id, user.sub);
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
    // B9: fechas/límite inválidos son 400 del cliente, no un 500 de Prisma
    // (Invalid Date / take: NaN).
    const parseDate = (label: string, value?: string): Date | undefined => {
      if (!value) return undefined;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`Parámetro '${label}' inválido: ${value}`);
      }
      return d;
    };
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      const n = Number(limit);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadRequestException(`Parámetro 'limit' inválido: ${limit}`);
      }
      parsedLimit = Math.min(Math.floor(n), 200);
    }
    return this.sales.list({
      status: parsedStatus,
      cashierId,
      shiftId,
      type,
      from: parseDate('from', from),
      to: parseDate('to', to),
      limit: parsedLimit,
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
    const result = await this.receipts.printReceipt(id, user.sub);
    return { ok: true, key: result.key };
  }

  /**
   * Devuelve el recibo en bytes ESC/POS (base64) para que el NAVEGADOR del
   * mostrador lo mande al print-agent LOCAL. Así la impresora no queda detrás
   * del backend (funciona aunque la API esté remota). Audita la impresión.
   */
  @CashierAccess()
  @Get(':id/escpos')
  getEscPos(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ escposBase64: string; receiptNumber: number; reprint: boolean }> {
    return this.receipts.getReceiptEscPos(id, user.sub);
  }

  /**
   * Cuentas abiertas (#3): envía a cocina SOLO lo pendiente (comanda
   * incremental) y estampa las líneas como enviadas. Devuelve ambas variantes
   * de comanda en bytes ESC/POS para que el POS las rutee a sus impresoras.
   */
  @CashierAccess()
  @Post(':id/send-to-kitchen')
  @HttpCode(200)
  sendToKitchen(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SendToKitchenResponse> {
    return this.receipts.sendToKitchen(id, user.sub);
  }

  /**
   * Comanda de COCINA en bytes ESC/POS (base64) para el print-agent local.
   * Sale al COBRAR (la venta puede seguir PENDIENTE_PAGO) — la cocina
   * arranca sin esperar la confirmación del pago.
   */
  @CashierAccess()
  @Get(':id/comanda-escpos')
  getComandaEscPos(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cancel') cancel?: string,
    @Query('variant') variant?: string,
    @Query('corrected') corrected?: string,
  ): Promise<{ escposBase64: string; receiptNumber: number; reprint: boolean }> {
    // ?cancel=true → ticket de ANULACIÓN (el cobro se abandonó tras imprimir
    // la comanda; la cocina debe descartar el pedido).
    // ?variant=kitchen → comanda de COCINA (excluye reventa directa: bebidas).
    // ?corrected=true → la comanda sale rotulada "PEDIDO MODIFICADO" (edición).
    return this.receipts.getComandaEscPos(
      id,
      user.sub,
      cancel === 'true',
      variant === 'kitchen' ? 'kitchen' : 'full',
      corrected === 'true',
    );
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
    return this.receipts.openDrawer({
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
  @Throttle({ default: { ttl: 300_000, limit: 5 } }) // anti-brute-force del PIN
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
    return this.receipts.openDrawer({
      saleId: null,
      reason: body.reason ?? null,
      cashierId: user.sub,
      approverPin: approvalPin,
    });
  }
}
