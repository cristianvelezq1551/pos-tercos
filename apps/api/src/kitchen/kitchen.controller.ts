import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ChecklistTypeEnum,
  CompleteChecklistSchema,
  CreateChecklistItemSchema,
  CreateKitchenIncidentSchema,
  KitchenCountSchema,
  MarkChecklistItemSchema,
  RegisterWasteSchema,
  UpdateChecklistItemSchema,
  type ChecklistDay,
  type ChecklistItem,
  type ChecklistType,
  type CompleteChecklist,
  type CreateChecklistItem,
  type CreateKitchenIncident,
  type EvidenceUpload,
  type JwtAccessPayload,
  type KitchenCount,
  type KitchenCountResult,
  type KitchenActivityDay,
  type KitchenIncident,
  type KitchenProductionRun,
  type KitchenWasteEntry,
  type MarkChecklistItem,
  type RegisterWaste,
  type Stockable,
  type UpdateChecklistItem,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, KitchenAccess } from '../auth/decorators/roles.decorator';
import { detectImageMime } from '../common/image-mime';
import { parseDateRange, ymdLocal } from '../common/local-dates';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { KitchenChecklistService } from './kitchen-checklist.service';
import { KitchenEvidenceService } from './kitchen-evidence.service';
import { KitchenIncidentsService } from './kitchen-incidents.service';
import { KitchenInventoryService } from './kitchen-inventory.service';
import { KitchenReportsService } from './kitchen-reports.service';

/** Tope de la foto de evidencia. Mismo valor que la de producción. */
const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

/** Rango por defecto del histórico del checklist cuando no se pide uno. */
const HISTORY_DEFAULT_DAYS = 14;

/** Corre un día YYYY-MM-DD N días (en calendario, sin tocar husos). */
function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** API de la app de cocina (cocinero). Inventario read + merma + conteo ciego,
 *  incidencias y checklist. La administración de ítems/resolución es admin. */
@Controller('kitchen')
export class KitchenController {
  constructor(
    private readonly inventory: KitchenInventoryService,
    private readonly incidents: KitchenIncidentsService,
    private readonly checklist: KitchenChecklistService,
    private readonly evidence: KitchenEvidenceService,
    private readonly reports: KitchenReportsService,
  ) {}

  // ── Vistas del dueño ──────────────────────────────────────────────

  /** Tandas de producción del rango, agrupadas por tanda. */
  @AdminAccess()
  @Get('productions')
  listProductions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('user_id') userId?: string,
  ): Promise<KitchenProductionRun[]> {
    return this.reports.listProductions({ ...parseDateRange(from, to), userId });
  }

  /** Mermas del rango con su costo real, quién y con qué foto. */
  @AdminAccess()
  @Get('waste')
  listWaste(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('user_id') userId?: string,
  ): Promise<KitchenWasteEntry[]> {
    return this.reports.listWaste({ ...parseDateRange(from, to), userId });
  }

  /** Resumen por día: rutinas, producción, merma, incidencias y por persona. */
  @AdminAccess()
  @Get('activity')
  activity(@Query('from') from?: string, @Query('to') to?: string): Promise<KitchenActivityDay[]> {
    const today = ymdLocal(new Date());
    return this.reports.activity(from ?? shiftDays(today, -HISTORY_DEFAULT_DAYS), to ?? today);
  }

  // ── Evidencia fotográfica ─────────────────────────────────────────

  /**
   * Sube la foto ANTES de registrar la merma o la incidencia y devuelve su key.
   * El MIME se detecta por los primeros bytes (§4.6): confiar en el header deja
   * pasar un archivo cualquiera con extensión de imagen.
   */
  @KitchenAccess()
  @Post('evidence')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: EVIDENCE_MAX_BYTES } }))
  async uploadEvidence(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<EvidenceUpload> {
    if (!file) throw new BadRequestException('Falta la foto.');
    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException('El archivo no parece una imagen válida (JPG, PNG, WebP, GIF).');
    }
    return this.evidence.upload(file.buffer, mime);
  }

  // ── Inventario de cocina ──────────────────────────────────────────

  @KitchenAccess()
  @Get('stock')
  listStock(@Query('para') para?: string): Promise<Stockable[]> {
    // `?para=conteo` trae TAMBIÉN lo que no se muestra en cocina (empaques,
    // recipientes): en un conteo físico se cuenta la bodega entera.
    return this.inventory.listStock({ paraConteo: para === 'conteo' });
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

  /** Sirve la foto de una incidencia. */
  @KitchenAccess()
  @Get('incidents/:id/evidence')
  async getIncidentEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.incidents.getEvidence(id);
    if (!buffer) throw new NotFoundException('Esa incidencia no tiene foto.');
    res.setHeader('Content-Type', detectImageMime(buffer) ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buffer);
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
  getChecklist(@Query('type') type?: string): Promise<ChecklistDay> {
    return this.checklist.getToday(this.parseType(type));
  }

  /** Marca o desmarca UNA tarea. Se guarda al toque: una rutina a medias que no
   *  se guarda es indistinguible de una que nadie empezó. */
  @KitchenAccess()
  @Post('checklist/mark')
  markChecklistItem(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(MarkChecklistItemSchema)) body: MarkChecklistItem,
  ): Promise<ChecklistDay> {
    return this.checklist.markItem(body, user.sub);
  }

  @KitchenAccess()
  @Post('checklist/complete')
  completeChecklist(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CompleteChecklistSchema)) body: CompleteChecklist,
  ): Promise<ChecklistDay> {
    return this.checklist.complete(body, user.sub);
  }

  /** Histórico del checklist (vista del dueño): qué se cumplió y qué no. */
  @AdminAccess()
  @Get('checklist/history')
  checklistHistory(@Query('from') from?: string, @Query('to') to?: string): Promise<ChecklistDay[]> {
    const today = ymdLocal(new Date());
    return this.checklist.history(from ?? shiftDays(today, -HISTORY_DEFAULT_DAYS), to ?? today);
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
