import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateInventoryMovementSchema,
  StockableTypeEnum,
  type CreateInventoryMovement,
  type InventoryMovement,
  type Stockable,
  type StockableType,
} from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  @Get('stock')
  listStock(
    @Query('only_active') onlyActive?: string,
    @Query('low_stock') lowStock?: string,
  ): Promise<Stockable[]> {
    return this.inventory.listStockables({
      onlyActive: onlyActive === 'true',
      lowStock: lowStock === 'true',
    });
  }

  @Get('stock/:entityType/:id')
  getStock(
    @Param('entityType') entityType: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Stockable> {
    const parsed = StockableTypeEnum.safeParse(entityType.toUpperCase());
    if (!parsed.success) {
      throw new BadRequestException(`entityType debe ser INGREDIENT o PRODUCT`);
    }
    return this.inventory.getStockableById(parsed.data, id);
  }

  @Get('movements')
  listMovements(
    @Query('entity_type') entityType?: string,
    @Query('ingredient_id') ingredientId?: string,
    @Query('product_id') productId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<InventoryMovement[]> {
    let parsedEntityType: StockableType | undefined;
    if (entityType) {
      const r = StockableTypeEnum.safeParse(entityType.toUpperCase());
      if (r.success) parsedEntityType = r.data;
    }
    return this.inventory.listMovements({
      entityType: parsedEntityType,
      ingredientId,
      productId,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(Number(limit), 500) : undefined,
    });
  }

  @AdminAccess()
  @Post('movements')
  async createMovement(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateInventoryMovementSchema)) body: CreateInventoryMovement,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ): Promise<InventoryMovement> {
    const movement = await this.inventory.createMovement(
      {
        ...body,
        idempotencyKey: body.idempotencyKey ?? idempotencyKeyHeader,
      },
      user.sub,
    );

    const auditAction =
      body.type === 'WASTE'
        ? 'INVENTORY_MOVEMENT_WASTE'
        : body.type === 'INITIAL'
          ? 'INVENTORY_MOVEMENT_INITIAL'
          : 'INVENTORY_MOVEMENT_MANUAL';

    await this.audit.log({
      userId: user.sub,
      action: auditAction,
      entityType: 'inventory_movement',
      entityId: movement.id,
      after: {
        entityType: movement.entityType,
        ingredientId: movement.ingredientId,
        productId: movement.productId,
        delta: movement.delta,
        type: movement.type,
        notes: movement.notes,
      },
    });

    return movement;
  }
}
