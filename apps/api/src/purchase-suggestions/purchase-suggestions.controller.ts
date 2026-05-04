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
  type JwtAccessPayload,
  type PurchaseSuggestion,
  type PurchaseSuggestionStatus,
  type ResolveSuggestion,
  type ScanResult,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
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

  /** Scan manual (debugging / on-demand). Dueño-only. */
  @OnlyDueno()
  @Post('admin/scan')
  scan(@CurrentUser() user: JwtAccessPayload): Promise<ScanResult> {
    return this.service.runScan(user.sub);
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
