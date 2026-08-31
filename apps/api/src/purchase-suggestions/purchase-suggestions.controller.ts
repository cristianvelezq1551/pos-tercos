import {
  BadRequestException,
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
  type EvaluateAllResult,
  type JwtAccessPayload,
  type PurchaseSuggestion,
  type PurchaseSuggestionStatus,
  type ResolveSuggestion,
  type ScanResult,
  type WhatsAppSendOutcome,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PurchaseSuggestionsService } from './purchase-suggestions.service';

/**
 * Endpoints de sugerencias de compra (FASE 12.C).
 *
 * Todo el módulo es Admin Operativo + Dueño (`@AdminAccess`), incluido el
 * escaneo manual.
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
    // Un filtro que no existe devolvía lista vacía, indistinguible de "no hay
    // nada pendiente": un enlace con un typo se veía como buenas noticias.
    if (parsedStatus && parsedStatus.length === 0) {
      throw new BadRequestException(
        'Ese filtro de estado no existe. Vuelve al listado y elige uno de las pestañas.',
      );
    }
    return this.service.list({ status: parsedStatus, limit: parseLimit(limit) });
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

  /** Escaneo manual, además del automático cada hora. */
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
  evaluateAllPending(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<EvaluateAllResult> {
    return this.service.evaluateAllPending(user.sub);
  }

  /** Manda un resumen de las sugerencias abiertas a dueños/admins por WhatsApp. */
  @AdminAccess()
  @Post('admin/send-summary')
  sendSummary(@CurrentUser() user: JwtAccessPayload): Promise<WhatsAppSendOutcome> {
    return this.service.sendSummaryToAdmins(user.sub);
  }
}

/**
 * Tope de filas. Sin piso, `?limit=-3` llegaba a Prisma como `take: -3`, que
 * es paginación HACIA ATRÁS: devolvía las 3 más VIEJAS en vez de las 3 más
 * nuevas, sin error. Silencioso e incorrecto.
 */
function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 200;
  return Math.min(Math.floor(n), 500);
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
