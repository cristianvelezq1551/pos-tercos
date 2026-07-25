import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateInventoryMovementSchema,
  CreateStockCountSchema,
  ResolveStockCountSchema,
  ReverseWasteSchema,
  StockableTypeEnum,
  type CountTask,
  type CreateInventoryMovement,
  type CreateStockCount,
  type InventoryMovement,
  type ResolveStockCount,
  type ReverseWaste,
  type Stockable,
  type StockableType,
  type StockCount,
} from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { InventoryService } from './inventory.service';
import { StockCountsService } from './stock-counts.service';

@AdminAccess()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stockCounts: StockCountsService,
    private readonly audit: AuditService,
  ) {}

  @Get('stock')
  listStock(
    @Query('only_active') onlyActive?: string,
    @Query('low_stock') lowStock?: string,
    @Query('negative') negative?: string,
  ): Promise<Stockable[]> {
    return this.inventory.listStockables({
      onlyActive: onlyActive === 'true',
      lowStock: lowStock === 'true',
      negative: negative === 'true',
    });
  }

  @Get('stock/:entityType/:id')
  getStock(
    @Param('entityType') entityType: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Stockable> {
    const parsed = StockableTypeEnum.safeParse(entityType.toUpperCase());
    if (!parsed.success) {
      throw new BadRequestException('El tipo debe ser insumo, producto o subproducto.');
    }
    return this.inventory.getStockableById(parsed.data, id);
  }

  /** Conteo físico ciclado: qué contar hoy (rotación, nunca contados primero). */
  @AdminAccess()
  @Get('count-tasks')
  getCountTasks(@Query('limit') limit?: string): Promise<CountTask[]> {
    const n = limit ? Math.min(Math.max(Number(limit) || 5, 1), 50) : 5;
    return this.stockCounts.getCountTasks(n);
  }

  /** Registra un conteo físico; si difiere del ledger crea el ajuste compensatorio. */
  @AdminAccess()
  @Post('counts')
  registerCount(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateStockCountSchema)) body: CreateStockCount,
  ): Promise<StockCount> {
    return this.stockCounts.register(body, user.sub);
  }

  /** Historial de conteos recientes. */
  @AdminAccess()
  @Get('counts')
  listCounts(@Query('limit') limit?: string): Promise<StockCount[]> {
    const n = limit ? Math.min(Math.max(Number(limit) || 30, 1), 100) : 30;
    return this.stockCounts.listRecent(n);
  }

  /** Conteos del cocinero pendientes de aprobación (#7). */
  @AdminAccess()
  @Get('counts/pending')
  listPendingCounts(): Promise<StockCount[]> {
    return this.stockCounts.listPending();
  }

  /** Aprueba un conteo pendiente → aplica el ajuste de stock. */
  @AdminAccess()
  @Post('counts/:id/approve')
  approveCount(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveStockCountSchema)) body: ResolveStockCount,
  ): Promise<StockCount> {
    return this.stockCounts.approve(id, user.sub, body.note);
  }

  /** Rechaza un conteo pendiente → no ajusta stock. */
  @AdminAccess()
  @Post('counts/:id/reject')
  rejectCount(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveStockCountSchema)) body: ResolveStockCount,
  ): Promise<StockCount> {
    return this.stockCounts.reject(id, user.sub, body.note);
  }

  @Get('movements')
  listMovements(
    @Query('entity_type') entityType?: string,
    @Query('ingredient_id') ingredientId?: string,
    @Query('product_id') productId?: string,
    @Query('subproduct_id') subproductId?: string,
    @Query('type') type?: string,
    @Query('source_type') sourceType?: string,
    @Query('source_id') sourceId?: string,
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
      subproductId,
      type,
      sourceType,
      sourceId,
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

  /**
   * Anula una merma registrada por error (total o parcial). Es la ÚNICA forma
   * de sacar una pérdida del P&G: un ajuste manual devuelve la cantidad pero
   * deja el costo restando del neto para siempre.
   */
  @Post('movements/:id/reverse-waste')
  async reverseWaste(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReverseWasteSchema)) body: ReverseWaste,
  ): Promise<InventoryMovement> {
    const movement = await this.inventory.reverseWaste(id, body, user.sub);

    await this.audit.log({
      userId: user.sub,
      action: 'INVENTORY_MOVEMENT_WASTE_REVERSED',
      entityType: 'inventory_movement',
      entityId: id,
      after: {
        reversalMovementId: movement.id,
        delta: movement.delta,
        reason: body.reason,
      },
    });

    return movement;
  }
}
