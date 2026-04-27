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
import { AdminAccess, CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** Cajeros también leen para mostrar tachados de precios en POS. */
  @CashierAccess()
  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Promotion[]> {
    return this.promotions.list({ onlyActive: onlyActive === 'true' });
  }

  @CashierAccess()
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Promotion> {
    return this.promotions.getById(id);
  }

  @AdminAccess()
  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreatePromotionSchema)) body: CreatePromotion,
  ): Promise<Promotion> {
    return this.promotions.create(body, user.sub);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePromotionSchema)) body: UpdatePromotion,
  ): Promise<Promotion> {
    return this.promotions.update(id, body, user.sub);
  }

  @AdminAccess()
  @Delete(':id')
  deactivate(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Promotion> {
    return this.promotions.deactivate(id, user.sub);
  }
}
