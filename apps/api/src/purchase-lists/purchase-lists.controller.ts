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
  CreatePurchaseListSchema,
  UpdatePurchaseListItemSchema,
  UpdatePurchaseListSchema,
  UpsertPurchaseListItemSchema,
  type CreatePurchaseList,
  type JwtAccessPayload,
  type PurchaseList,
  type PurchaseListSummary,
  type ShortageCandidate,
  type UpdatePurchaseList,
  type UpdatePurchaseListItem,
  type UpsertPurchaseListItem,
} from '@pos-tercos/types';
import type { PurchaseOrderDoc, ShortageListDoc } from '@pos-tercos/domain';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PurchaseListDocsService } from './purchase-list-docs.service';
import { PurchaseListReviewService } from './purchase-list-review.service';
import { PurchaseListsService } from './purchase-lists.service';
import { ShortageCandidatesService } from './shortage-candidates.service';

/**
 * Lista de faltantes armada a mano. Todo el módulo es Admin Operativo + Dueño:
 * muestra costos y total estimado, que no van a roles operativos.
 */
@AdminAccess()
@Controller('purchase-lists')
export class PurchaseListsController {
  constructor(
    private readonly lists: PurchaseListsService,
    private readonly candidates: ShortageCandidatesService,
    private readonly docs: PurchaseListDocsService,
    private readonly review: PurchaseListReviewService,
  ) {}

  /** Qué se puede agregar: catálogo comprable con existencias y faltante. */
  @Get('candidates')
  listCandidates(@Query('only_low') onlyLow?: string): Promise<ShortageCandidate[]> {
    return this.candidates.list(onlyLow === 'true');
  }

  @Get()
  list(@Query('limit') limit?: string): Promise<PurchaseListSummary[]> {
    const n = Number(limit);
    return this.lists.list(Number.isFinite(n) && n > 0 ? n : 50);
  }

  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreatePurchaseListSchema)) body: CreatePurchaseList,
  ): Promise<PurchaseList> {
    return this.lists.create(body, user.sub);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseList> {
    return this.lists.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(UpdatePurchaseListSchema)) body: UpdatePurchaseList,
  ): Promise<PurchaseList> {
    return this.lists.update(id, body, user.sub);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseList> {
    return this.lists.close(id, user.sub);
  }

  /** Devuelve cuerpo (y no 204) por la convención del admin, cuyo cliente
   *  siempre parsea JSON: un 204 vacío lo rompe. */
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<{ ok: true }> {
    await this.lists.remove(id, user.sub);
    return { ok: true };
  }

  // ---- ítems ----

  @Post(':id/items')
  upsertItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(UpsertPurchaseListItemSchema)) body: UpsertPurchaseListItem,
  ): Promise<PurchaseList> {
    return this.lists.upsertItem(id, body, user.sub);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(UpdatePurchaseListItemSchema)) body: UpdatePurchaseListItem,
  ): Promise<PurchaseList> {
    return this.lists.updateItem(id, itemId, body, user.sub);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<PurchaseList> {
    return this.lists.removeItem(id, itemId);
  }

  // ---- papeles ----

  /** Documento general (interno, con costos) listo para imprimir. */
  @Get(':id/document')
  generalDoc(@Param('id', ParseUUIDPipe) id: string): Promise<ShortageListDoc> {
    return this.docs.generalDoc(id);
  }

  /** Proveedores presentes en la lista, para ofrecer un papel por cada uno. */
  @Get(':id/suppliers')
  suppliers(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Array<{ supplierId: string | null; supplierName: string; itemCount: number }>> {
    return this.docs.suppliersIn(id);
  }

  /**
   * Documento para UN proveedor, sin costos. `supplier_id` vacío o "none"
   * devuelve los renglones que quedaron sin proveedor asignado.
   */
  @Get(':id/document/supplier')
  supplierDoc(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('supplier_id') supplierId?: string,
  ): Promise<PurchaseOrderDoc> {
    const resolved = !supplierId || supplierId === 'none' ? null : supplierId;
    return this.docs.supplierDoc(id, resolved);
  }

  /** La IA revisa si las cantidades alcanzan. Cuesta plata por corrida. */
  @Post(':id/review')
  reviewWithAi(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseList> {
    return this.review.review(id, user.sub);
  }
}
