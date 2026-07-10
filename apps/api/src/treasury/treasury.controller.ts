import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreateAdjustmentSchema,
  CreateTransferSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
  UpdateTreasuryConfigSchema,
  type CreateAdjustment,
  type CreateTransfer,
  type JwtAccessPayload,
  type TreasuryAnchorDate,
  type TreasuryConfig,
  type TreasuryMovement,
  type TreasurySummary,
  type UpdateTreasuryConfig,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TreasuryService } from './treasury.service';

/** Valida (si vino) el header Idempotency-Key; undefined si ausente. */
function parseIdemKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return IdempotencyKeySchema.safeParse(raw).success ? raw : undefined;
}

/** Tesorería — control de caja de dos bolsillos. Dueño-only. */
@Controller('treasury')
@OnlyDueno()
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('summary')
  getSummary(): Promise<TreasurySummary> {
    return this.treasury.getSummary();
  }

  @Get('config')
  getConfig(): Promise<TreasuryConfig> {
    return this.treasury.getConfig();
  }

  /**
   * Solo la fecha de corte, SIN saldos. AdminAccess (pisa el OnlyDueno de la
   * clase): la usa el modal de facturas para avisar "fecha anterior al corte"
   * al registrar un pago, sin exponer datos financieros al admin operativo.
   */
  @AdminAccess()
  @Get('anchor-date')
  async getAnchorDate(): Promise<TreasuryAnchorDate> {
    const cfg = await this.treasury.getConfig();
    return { anchorDate: cfg.anchorDate };
  }

  @Patch('config')
  updateConfig(
    @Body(new ZodValidationPipe(UpdateTreasuryConfigSchema)) body: UpdateTreasuryConfig,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<TreasuryConfig> {
    return this.treasury.updateConfig(body, actor.sub);
  }

  @Get('movements')
  listMovements(@Query('limit') limit?: string): Promise<TreasuryMovement[]> {
    const n = limit ? Math.min(Math.max(Number(limit) || 100, 1), 500) : 100;
    return this.treasury.listMovements(n);
  }

  @Post('transfer')
  createTransfer(
    @Body(new ZodValidationPipe(CreateTransferSchema)) body: CreateTransfer,
    @CurrentUser() actor: JwtAccessPayload,
    @Headers(IDEMPOTENCY_HEADER) idemKey?: string,
  ): Promise<TreasuryMovement> {
    return this.treasury.createTransfer(body, actor.sub, parseIdemKey(idemKey));
  }

  @Post('adjustment')
  createAdjustment(
    @Body(new ZodValidationPipe(CreateAdjustmentSchema)) body: CreateAdjustment,
    @CurrentUser() actor: JwtAccessPayload,
    @Headers(IDEMPOTENCY_HEADER) idemKey?: string,
  ): Promise<TreasuryMovement> {
    return this.treasury.createAdjustment(body, actor.sub, parseIdemKey(idemKey));
  }

  @Post('movements/:id/void')
  voidMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    return this.treasury.voidMovement(id, actor.sub);
  }
}
