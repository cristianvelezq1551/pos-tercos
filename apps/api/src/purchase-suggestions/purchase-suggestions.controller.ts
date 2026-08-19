import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  PurchaseSuggestionStatusEnum,
  ResolveSuggestionSchema,
  SendToSupplierSchema,
  type HistoricalSupplier,
  type JwtAccessPayload,
  type PurchaseSuggestion,
  type PurchaseSuggestionStatus,
  type ResolveSuggestion,
  type ScanResult,
  type SendToSupplier,
  type SupplierOrderLink,
  type WhatsAppSendOutcome,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PurchaseSuggestionsService } from './purchase-suggestions.service';

/**
 * Endpoints de sugerencias de compra (FASE 12.C).
 *
 * - List/getById/accept/reject — Admin Operativo + Dueño
 * - Manual scan — Dueño-only (operación intrusiva, evita ruido)
 */
@Controller('purchase-suggestions')
export class PurchaseSuggestionsController {
  constructor(private readonly service: PurchaseSuggestionsService) {}

  @AdminAccess()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<PurchaseSuggestion[]> {
    const parsedStatus = status ? parseStatusList(status) : undefined;
    const parsedLimit = limit ? Math.min(Number(limit) || 200, 500) : undefined;
    return this.service.list({ status: parsedStatus, limit: parsedLimit });
  }

  @AdminAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseSuggestion> {
    return this.service.getById(id);
  }

  @AdminAccess()
  @Post(':id/accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(ResolveSuggestionSchema))
    body: ResolveSuggestion,
  ): Promise<PurchaseSuggestion> {
    return this.service.accept(id, user.sub, body);
  }

  @AdminAccess()
  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(ResolveSuggestionSchema))
    body: ResolveSuggestion,
  ): Promise<PurchaseSuggestion> {
    return this.service.reject(id, user.sub, body);
  }

  /** Scan manual (debugging / on-demand). Admin Operativo + Dueño. */
  @AdminAccess()
  @Post('admin/scan')
  scan(@CurrentUser() user: JwtAccessPayload): Promise<ScanResult> {
    return this.service.runScan(user.sub);
  }

  /** Evaluación LLM individual (cuesta $$). Admin Operativo + Dueño. */
  @AdminAccess()
  @Post(':id/evaluate')
  evaluate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseSuggestion> {
    return this.service.evaluate(id, user.sub);
  }

  /** Evaluar todas las PENDING en batch. Admin Operativo + Dueño. */
  @AdminAccess()
  @Post('admin/evaluate-all-pending')
  evaluateAllPending(@CurrentUser() user: JwtAccessPayload): Promise<{
    evaluated: number;
    failed: number;
  }> {
    return this.service.evaluateAllPending(user.sub);
  }

  /** Lista los proveedores que históricamente han vendido este item. */
  @AdminAccess()
  @Get(':id/suppliers')
  listSuppliers(@Param('id', ParseUUIDPipe) id: string): Promise<HistoricalSupplier[]> {
    return this.service.listSuppliersFor(id);
  }

  /**
   * Vista previa del pedido: texto + link `wa.me`. No cambia nada — la UI lo
   * pide cada vez que el usuario edita proveedor, cantidad o nota.
   */
  @AdminAccess()
  @Post(':id/supplier-order/preview')
  previewSupplierOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SendToSupplierSchema)) body: SendToSupplier,
  ): Promise<SupplierOrderLink> {
    return this.service.buildSupplierOrder(id, body, user.sub);
  }

  /** Marca la sugerencia ACCEPTED tras abrir el chat del proveedor. */
  @AdminAccess()
  @Post(':id/supplier-order')
  markSupplierOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(SendToSupplierSchema)) body: SendToSupplier,
  ): Promise<{ link: SupplierOrderLink; suggestion: PurchaseSuggestion }> {
    return this.service.markOrderedToSupplier(id, body, user.sub);
  }

  /** Manda un resumen de las sugerencias abiertas a dueños/admins por WhatsApp. */
  @AdminAccess()
  @Post('admin/send-summary')
  sendSummary(@CurrentUser() user: JwtAccessPayload): Promise<WhatsAppSendOutcome> {
    return this.service.sendSummaryToAdmins(user.sub);
  }
}

function parseStatusList(raw: string): PurchaseSuggestionStatus[] {
  // Acepta "PENDING" o "PENDING,EVALUATED"
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  const result: PurchaseSuggestionStatus[] = [];
  for (const p of parts) {
    const parsed = PurchaseSuggestionStatusEnum.safeParse(p);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}
