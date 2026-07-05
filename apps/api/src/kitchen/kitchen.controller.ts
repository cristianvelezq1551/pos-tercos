import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ChecklistTypeEnum,
  CompleteChecklistSchema,
  CreateChecklistItemSchema,
  CreateKitchenIncidentSchema,
  KitchenCountSchema,
  RegisterWasteSchema,
  UpdateChecklistItemSchema,
  type ChecklistItem,
  type ChecklistToday,
  type ChecklistType,
  type CompleteChecklist,
  type CreateChecklistItem,
  type CreateKitchenIncident,
  type JwtAccessPayload,
  type KitchenCount,
  type KitchenCountResult,
  type KitchenIncident,
  type RegisterWaste,
  type Stockable,
  type UpdateChecklistItem,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, KitchenAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { KitchenChecklistService } from './kitchen-checklist.service';
import { KitchenIncidentsService } from './kitchen-incidents.service';
import { KitchenInventoryService } from './kitchen-inventory.service';

/** API de la app de cocina (cocinero). Inventario read + merma + conteo ciego,
 *  incidencias y checklist. La administración de ítems/resolución es admin. */
@Controller('kitchen')
export class KitchenController {
  constructor(
    private readonly inventory: KitchenInventoryService,
    private readonly incidents: KitchenIncidentsService,
    private readonly checklist: KitchenChecklistService,
  ) {}

  // ── Inventario de cocina ──────────────────────────────────────────

  @KitchenAccess()
  @Get('stock')
  listStock(): Promise<Stockable[]> {
    return this.inventory.listStock();
  }

  @KitchenAccess()
  @Post('waste')
  registerWaste(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(RegisterWasteSchema)) body: RegisterWaste,
  ): Promise<Stockable> {
    return this.inventory.registerWaste(body, user.sub);
  }

  @KitchenAccess()
  @Post('count')
  registerCount(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(KitchenCountSchema)) body: KitchenCount,
  ): Promise<KitchenCountResult> {
    return this.inventory.registerCount(body, user.sub);
  }

  // ── Bitácora de incidencias ───────────────────────────────────────

  @KitchenAccess()
  @Get('incidents')
  listIncidents(@Query('only_open') onlyOpen?: string): Promise<KitchenIncident[]> {
    return this.incidents.list({ onlyOpen: onlyOpen === 'true' });
  }

  @KitchenAccess()
  @Post('incidents')
  createIncident(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateKitchenIncidentSchema)) body: CreateKitchenIncident,
  ): Promise<KitchenIncident> {
    return this.incidents.create(body, user.sub);
  }

  /** Resolver una incidencia: lo hace el admin/dueño (cierra el pendiente). */
  @AdminAccess()
  @Post('incidents/:id/resolve')
  resolveIncident(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KitchenIncident> {
    return this.incidents.resolve(id, user.sub);
  }

  // ── Checklist apertura / cierre ───────────────────────────────────

  @KitchenAccess()
  @Get('checklist')
  getChecklist(@Query('type') type?: string): Promise<ChecklistToday> {
    return this.checklist.getToday(this.parseType(type));
  }

  @KitchenAccess()
  @Post('checklist/complete')
  completeChecklist(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CompleteChecklistSchema)) body: CompleteChecklist,
  ): Promise<ChecklistToday> {
    return this.checklist.complete(body, user.sub);
  }

  // ── Admin: administrar ítems del checklist ────────────────────────

  @AdminAccess()
  @Get('checklist/items')
  listChecklistItems(@Query('type') type?: string): Promise<ChecklistItem[]> {
    return this.checklist.listItems(type ? this.parseType(type) : undefined);
  }

  @AdminAccess()
  @Post('checklist/items')
  createChecklistItem(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateChecklistItemSchema)) body: CreateChecklistItem,
  ): Promise<ChecklistItem> {
    return this.checklist.createItem(body, user.sub);
  }

  @AdminAccess()
  @Patch('checklist/items/:id')
  updateChecklistItem(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateChecklistItemSchema)) body: UpdateChecklistItem,
  ): Promise<ChecklistItem> {
    return this.checklist.updateItem(id, body, user.sub);
  }

  private parseType(raw?: string): ChecklistType {
    const parsed = ChecklistTypeEnum.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException("Query 'type' debe ser OPEN o CLOSE.");
    }
    return parsed.data;
  }
}
