import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateInventoryMovementSchema,
  type CreateInventoryMovement,
  type IngredientWithStock,
  type InventoryMovement,
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
  ): Promise<IngredientWithStock[]> {
    return this.inventory.listIngredientsWithStock({
      onlyActive: onlyActive === 'true',
      lowStock: lowStock === 'true',
    });
  }

  @Get('stock/:id')
  getStock(@Param('id', ParseUUIDPipe) id: string): Promise<IngredientWithStock> {
    return this.inventory.getIngredientWithStock(id);
  }

  @Get('movements')
  listMovements(
    @Query('ingredient_id') ingredientId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<InventoryMovement[]> {
    return this.inventory.listMovements({
      ingredientId,
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
        ingredientId: movement.ingredientId,
        delta: movement.delta,
        type: movement.type,
        notes: movement.notes,
      },
    });

    return movement;
  }
}
