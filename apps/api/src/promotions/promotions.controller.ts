import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreatePromotionSchema,
  UpdatePromotionSchema,
  type CreatePromotion,
  type JwtAccessPayload,
  type Promotion,
  type UpdatePromotion,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashierAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** Cajeros también leen para mostrar tachados de precios en POS. */
  @CashierAccess()
  @Get()
  list(
    @Query('only_active') onlyActive?: string,
    @Query('channel') channel?: string,
  ): Promise<Promotion[]> {
    return this.promotions.list({
      onlyActive: onlyActive === 'true',
      // Filtro opcional por canal (el POS pide channel=POS para no mostrar
      // tachados de promos solo-web). Valor desconocido = sin filtro.
      channel: channel === 'POS' || channel === 'WEB' ? channel : undefined,
    });
  }

  @CashierAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Promotion> {
    return this.promotions.getById(id);
  }

  @OnlyDueno()
  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreatePromotionSchema)) body: CreatePromotion,
  ): Promise<Promotion> {
    return this.promotions.create(body, user.sub);
  }

  @OnlyDueno()
  @Patch(':id')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePromotionSchema)) body: UpdatePromotion,
  ): Promise<Promotion> {
    return this.promotions.update(id, body, user.sub);
  }

  @OnlyDueno()
  @Delete(':id')
  deactivate(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Promotion> {
    return this.promotions.deactivate(id, user.sub);
  }
}
