import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes } from '@nestjs/common';
import {
  CreateSubproductSchema,
  RecordProductionSchema,
  UpdateSubproductSchema,
  type CreateSubproduct,
  type JwtAccessPayload,
  type ProductionRun,
  type RecordProduction,
  type Subproduct,
  type UpdateSubproduct,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, KitchenAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductionService } from './production.service';
import { SubproductsService } from './subproducts.service';

@Controller('subproducts')
export class SubproductsController {
  constructor(
    private readonly subproducts: SubproductsService,
    private readonly production: ProductionService,
  ) {}

  @Get()
  list(@Query('only_active') onlyActive?: string): Promise<Subproduct[]> {
    return this.subproducts.list({ onlyActive: onlyActive === 'true' });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.getById(id);
  }

  @AdminAccess()
  @Post()
  @UsePipes(new ZodValidationPipe(CreateSubproductSchema))
  create(@Body() body: CreateSubproduct): Promise<Subproduct> {
    return this.subproducts.create(body);
  }

  @AdminAccess()
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSubproductSchema)) body: UpdateSubproduct,
  ): Promise<Subproduct> {
    return this.subproducts.update(id, body);
  }

  @AdminAccess()
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Subproduct> {
    return this.subproducts.deactivate(id);
  }

  /** Elimina DEFINITIVAMENTE — Dueño-only. */
  @OnlyDueno()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.subproducts.remove(id);
  }

  /**
   * Registra una tanda de producción: +N al stock del subproducto y consume
   * insumos según receta. Cocinero / Admin / Dueño.
   *
   * Body: { quantityProduced, notes?, idempotencyKey? }
   * Bloquea si algún insumo no tiene stock suficiente (409).
   */
  @KitchenAccess()
  @Post(':id/produce')
  produce(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(RecordProductionSchema)) body: RecordProduction,
  ): Promise<ProductionRun> {
    return this.production.produce(id, body, user.sub);
  }
}
