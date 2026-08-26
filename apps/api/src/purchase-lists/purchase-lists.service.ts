import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreatePurchaseList,
  ShortageCandidate,
  PurchaseList,
  PurchaseListSummary,
  StockableType,
  UpdatePurchaseList,
  UpdatePurchaseListItem,
  UpsertPurchaseListItem,
} from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  includeFullList,
  toListDto,
  toSummaryDto,
  type DbListWithItems,
} from './purchase-lists.mappers';
import { ShortageCandidatesService } from './shortage-candidates.service';

const NO_EXISTE =
  'No encontramos esa lista. Puede que ya no exista o que el enlace esté viejo.';
const YA_CERRADA =
  'Esta lista ya está cerrada. Crea una nueva para pedir otra vez.';

/** Tope de ítems por lista: más que esto no cabe en una hoja ni en una compra. */
const MAX_ITEMS = 200;

@Injectable()
export class PurchaseListsService {
  private readonly logger = new Logger(PurchaseListsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly candidates: ShortageCandidatesService,
  ) {}

  // ================================================================
  // LECTURA
  // ================================================================

  async list(limit = 50): Promise<PurchaseListSummary[]> {
    const rows = await this.prisma.purchaseList.findMany({
      include: includeFullList(),
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(toSummaryDto);
  }

  async getById(id: string): Promise<PurchaseList> {
    return toListDto(await this.loadOrThrow(id));
  }

  private async loadOrThrow(id: string): Promise<DbListWithItems> {
    const row = await this.prisma.purchaseList.findUnique({
      where: { id },
      include: includeFullList(),
    });
    if (!row) throw new NotFoundException(NO_EXISTE);
    return row;
  }

  private async loadDraftOrThrow(id: string): Promise<DbListWithItems> {
    const row = await this.loadOrThrow(id);
    if (row.status !== 'DRAFT') throw new BadRequestException(YA_CERRADA);
    return row;
  }

  // ================================================================
  // CREAR / EDITAR
  // ================================================================

  async create(input: CreatePurchaseList, userId: string): Promise<PurchaseList> {
    const created = await this.prisma.purchaseList.create({
      data: {
        title: input.title ?? null,
        notes: input.notes ?? null,
        createdById: userId,
      },
    });

    // Nace llena con lo que está bajo el mínimo: quien compra ajusta en vez de
    // teclear desde cero, que es donde se olvidan cosas.
    if (input.prefillFromLowStock) {
      const faltantes = await this.candidates.list(true);
      for (const c of faltantes.slice(0, MAX_ITEMS)) {
        await this.prisma.purchaseListItem.create({
          data: {
            listId: created.id,
            entityType: c.entityType,
            ingredientId: c.entityType === 'INGREDIENT' ? c.entityId : null,
            productId: c.entityType === 'PRODUCT' ? c.entityId : null,
            quantity: c.suggestedQty,
            unitPurchase: c.unitPurchase,
            unitStock: c.unitStock,
            conversionFactor: c.conversionFactor,
            currentStock: c.currentStock,
            thresholdMin: c.thresholdMin,
            estUnitCost: c.estUnitCost,
            estTotal: ShortageCandidatesService.estTotalFor(c.suggestedQty, c.estUnitCost),
            supplierId: c.lastSupplierId,
          },
        });
      }
    }

    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_CREATED',
      entityType: 'purchase_list',
      entityId: created.id,
      metadata: { title: created.title, prefilled: input.prefillFromLowStock === true },
    });

    return this.getById(created.id);
  }

  async update(
    id: string,
    input: UpdatePurchaseList,
    userId: string,
  ): Promise<PurchaseList> {
    await this.loadDraftOrThrow(id);
    await this.prisma.purchaseList.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_UPDATED',
      entityType: 'purchase_list',
      entityId: id,
    });
    return this.getById(id);
  }

  /** Cerrar = ya se pidió. Queda como historial y no se edita más. */
  async close(id: string, userId: string): Promise<PurchaseList> {
    const row = await this.loadDraftOrThrow(id);
    if (row.items.length === 0) {
      throw new BadRequestException(
        'No puedes cerrar una lista vacía. Agrega al menos un insumo o bórrala.',
      );
    }
    // Claim condicionado: dos personas cerrando a la vez no duplican bitácora.
    const claim = await this.prisma.purchaseList.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
    });
    if (claim.count === 0) throw new BadRequestException(YA_CERRADA);

    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_CLOSED',
      entityType: 'purchase_list',
      entityId: id,
      metadata: { items: row.items.length },
    });
    return this.getById(id);
  }

  /** Solo borradores: una lista cerrada es historial y no se borra. */
  async remove(id: string, userId: string): Promise<void> {
    await this.loadDraftOrThrow(id);
    await this.prisma.purchaseList.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_DELETED',
      entityType: 'purchase_list',
      entityId: id,
    });
  }

  // ================================================================
  // ÍTEMS
  // ================================================================

  /**
   * Agrega un ítem, o ACTUALIZA la cantidad si ya estaba: dos renglones del
   * mismo pan hacen que quien compra pida el doble sin darse cuenta (el índice
   * único lo impide, esto lo vuelve amable).
   */
  async upsertItem(
    listId: string,
    input: UpsertPurchaseListItem,
    userId: string,
  ): Promise<PurchaseList> {
    const snap = await this.assertPuedeAgregarse(listId, input);

    const quantity = input.quantity ?? snap.suggestedQty;
    const isIngredient = input.entityType === 'INGREDIENT';
    const estTotal = ShortageCandidatesService.estTotalFor(quantity, snap.estUnitCost);
    const identidad = {
      listId,
      entityType: input.entityType,
      ingredientId: isIngredient ? input.entityId : null,
      productId: isIngredient ? null : input.entityId,
    };

    // Prisma no admite el índice compuesto como selector único porque dos de
    // sus columnas son nulables, así que se busca y se decide. La carrera la
    // tapa el índice de la DB: si otro lo insertó en el medio cae P2002 y se
    // resuelve como actualización.
    const existente = await this.prisma.purchaseListItem.findFirst({
      where: identidad,
      select: { id: true },
    });

    const cambios = {
      quantity,
      estTotal,
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    if (existente) {
      await this.prisma.purchaseListItem.update({ where: { id: existente.id }, data: cambios });
    } else {
      try {
        await this.crearRenglon(identidad, snap, quantity, estTotal, input);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        await this.prisma.purchaseListItem.updateMany({ where: identidad, data: cambios });
      }
    }

    // Cambiar QUÉ y CUÁNTO se va a comprar es la mutación con consecuencia de
    // plata de esta feature; sus hermanas (crear/editar/cerrar/borrar) ya
    // dejaban rastro y esta no. Se registra bajo la misma acción para no
    // inventar un tipo nuevo: la lista cambió, y consta quién la cambió.
    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_UPDATED',
      entityType: 'purchase_list',
      entityId: listId,
      metadata: {
        stage: 'item',
        entityType: input.entityType,
        entityId: input.entityId,
        quantity,
      },
    });

    return this.getById(listId);
  }

  /** Lista editable, ítem comprable y con cupo. Devuelve su snapshot. */
  private async assertPuedeAgregarse(
    listId: string,
    input: UpsertPurchaseListItem,
  ): Promise<ShortageCandidate> {
    const list = await this.loadDraftOrThrow(listId);
    if (input.entityType === 'SUBPRODUCT') {
      throw new BadRequestException(
        'Las preparaciones de cocina no se compran: se producen. Agrega los insumos que necesita.',
      );
    }
    if (list.items.length >= MAX_ITEMS) {
      throw new BadRequestException(
        `Una lista admite hasta ${MAX_ITEMS} ítems. Cierra esta y arma otra.`,
      );
    }
    const snap = await this.candidates.snapshotOf(input.entityType, input.entityId);
    if (!snap) {
      throw new NotFoundException(
        'Ese insumo o producto ya no existe, o no se compra. Elige otro de la lista.',
      );
    }
    return snap;
  }

  /** El insert del renglón, con el snapshot de unidades y existencias. */
  private async crearRenglon(
    identidad: {
      listId: string;
      entityType: StockableType;
      ingredientId: string | null;
      productId: string | null;
    },
    snap: ShortageCandidate,
    quantity: number,
    estTotal: number | null,
    input: UpsertPurchaseListItem,
  ): Promise<void> {
    await this.prisma.purchaseListItem.create({
      data: {
        ...identidad,
        quantity,
        unitPurchase: snap.unitPurchase,
        unitStock: snap.unitStock,
        conversionFactor: snap.conversionFactor,
        currentStock: snap.currentStock,
        thresholdMin: snap.thresholdMin,
        estUnitCost: snap.estUnitCost,
        estTotal,
        supplierId: input.supplierId ?? snap.lastSupplierId,
        note: input.note ?? null,
      },
    });
  }

  async updateItem(
    listId: string,
    itemId: string,
    input: UpdatePurchaseListItem,
    _userId: string,
  ): Promise<PurchaseList> {
    await this.loadDraftOrThrow(listId);
    const item = await this.prisma.purchaseListItem.findFirst({
      where: { id: itemId, listId },
    });
    if (!item) {
      throw new NotFoundException('Ese renglón ya no está en la lista. Recarga la página.');
    }

    const quantity = input.quantity ?? Number(item.quantity);
    await this.prisma.purchaseListItem.update({
      where: { id: itemId },
      data: {
        quantity,
        estTotal: ShortageCandidatesService.estTotalFor(
          quantity,
          item.estUnitCost === null ? null : Number(item.estUnitCost),
        ),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
    return this.getById(listId);
  }

  async removeItem(listId: string, itemId: string): Promise<PurchaseList> {
    await this.loadDraftOrThrow(listId);
    const borrados = await this.prisma.purchaseListItem.deleteMany({
      where: { id: itemId, listId },
    });
    if (borrados.count === 0) {
      throw new NotFoundException('Ese renglón ya no está en la lista. Recarga la página.');
    }
    return this.getById(listId);
  }
}

/** P2002 = el índice único de la DB rechazó un duplicado. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}
