import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreateAdjustmentSchema,
  CreateTransferSchema,
  UpdateTreasuryConfigSchema,
  type CreateAdjustment,
  type CreateTransfer,
  type JwtAccessPayload,
  type TreasuryConfig,
  type TreasuryMovement,
  type TreasurySummary,
  type UpdateTreasuryConfig,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TreasuryService } from './treasury.service';

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
  ): Promise<TreasuryMovement> {
    return this.treasury.createTransfer(body, actor.sub);
  }

  @Post('adjustment')
  createAdjustment(
    @Body(new ZodValidationPipe(CreateAdjustmentSchema)) body: CreateAdjustment,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<TreasuryMovement> {
    return this.treasury.createAdjustment(body, actor.sub);
  }

  @Post('movements/:id/void')
  voidMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    return this.treasury.voidMovement(id, actor.sub);
  }
}
