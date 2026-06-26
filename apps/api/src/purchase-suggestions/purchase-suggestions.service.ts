import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { buildPurchaseSuggestionUserPrompt, type WhatsAppProvider } from '@pos-tercos/domain';
import type {
  HistoricalSupplier,
  PurchaseSuggestion,
  PurchaseSuggestionStatus,
  ResolveSuggestion,
  ScanResult,
  SendToSupplier,
  WhatsAppSendOutcome,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

type DbSuggestionWithRelations = Prisma.PurchaseSuggestionGetPayload<{
  include: {
    ingredient: { select: { name: true } };
    product: { select: { name: true } };
    resolvedBy: { select: { fullName: true } };
  };
}>;

interface ListFilter {
  status?: PurchaseSuggestionStatus | PurchaseSuggestionStatus[];
  limit?: number;
}

@Injectable()
export class PurchaseSuggestionsService {
  private readonly logger = new Logger(PurchaseSuggestionsService.name);
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly llm: LLMService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  // ==================================================================
  // SCAN — detección horaria de bajo stock + creación de sugerencias
  // ==================================================================

  /**
   * Cron horario al minuto :15 (escalonado para no chocar con otras crons
   * de inicio de hora). El audit log queda con userId=null porque no hay
   * actor humano: lo dispara el scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runScanScheduled(): Promise<void> {
    // Guard de re-entrada: un scan lento (loop por stockable + create + audit)
    // no debe solaparse con el siguiente tick y duplicar trabajo sobre un
    // snapshot de dedupe ya viejo.
    if (this.scanning) {
      this.logger.warn('scan anterior aún en curso — se omite este tick');
      return;
    }
    this.scanning = true;
    try {
      await this.runScan(null);
    } catch (e) {
      // No re-lanzar: el cron no tiene supervisor que reintente.
      this.logger.error(
        `Scan cron failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Algoritmo:
   *   1. Iterar stockables con thresholdMin > 0.
   *   2. Para cada uno con currentStock < thresholdMin:
   *        - Si NO hay sugerencia PENDING/EVALUATED activa para esa entidad,
   *          crear una nueva. Audit `PURCHASE_SUGGESTION_CREATED`.
   *   3. Para cada sugerencia PENDING/EVALUATED existente cuyo stockable
   *      YA NO está bajo threshold (se repuso por otra vía), marcarla STALE.
   *      Audit `PURCHASE_SUGGESTION_STALE`.
   *
   * Idempotente: re-correr la cron en el mismo minuto no genera duplicados.
   *
   * @param systemUserId ID del user para audit (típicamente el dueño o un
   *   user "system" si existiera). Si null, audit queda con userId=null.
   */
  async runScan(systemUserId: string | null = null): Promise<ScanResult> {
    const scannedAt = new Date();
    const [stockables, ingredientCosts, productCosts] = await Promise.all([
      this.inventory.listStockables({ onlyActive: true }),
      this.prisma.ingredient.findMany({
        where: { isActive: true },
        select: { id: true, lastUnitCost: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, directResale: true },
        select: { id: true, lastUnitCost: true },
      }),
    ]);

    const costMap = new Map<string, number | null>();
    for (const r of ingredientCosts) {
      costMap.set(
        `INGREDIENT:${r.id}`,
        r.lastUnitCost === null ? null : Number(r.lastUnitCost),
      );
    }
    for (const r of productCosts) {
      costMap.set(
        `PRODUCT:${r.id}`,
        r.lastUnitCost === null ? null : Number(r.lastUnitCost),
      );
    }

    // Pre-cargar sugerencias activas (PENDING o EVALUATED) para dedupe + stale
    const activeSuggestions = await this.prisma.purchaseSuggestion.findMany({
      where: { status: { in: ['PENDING', 'EVALUATED'] } },
      select: {
        id: true,
        entityType: true,
        ingredientId: true,
        productId: true,
      },
    });
    const activeKeySet = new Set(
      activeSuggestions.map((s) =>
        s.entityType === 'INGREDIENT'
          ? `INGREDIENT:${s.ingredientId}`
          : `PRODUCT:${s.productId}`,
      ),
    );

    let createdCount = 0;
    const lowStockKeys = new Set<string>();

    for (const s of stockables) {
      const thresholdMin = s.thresholdMin;
      if (thresholdMin <= 0) continue;
      const currentStock = s.currentStock;
      const key = `${s.type}:${s.id}`;

      if (currentStock >= thresholdMin) continue;
      lowStockKeys.add(key);

      if (activeKeySet.has(key)) continue; // ya hay sugerencia abierta

      const suggestedQty = computeSuggestedQty(
        thresholdMin,
        currentStock,
        s.conversionFactor,
      );
      const estUnitCost = costMap.get(key) ?? null;
      const estTotal =
        estUnitCost === null ? null : roundMoney(suggestedQty * estUnitCost);

      const created = await this.prisma.purchaseSuggestion.create({
        data: {
          entityType: s.type,
          ingredientId: s.type === 'INGREDIENT' ? s.id : null,
          productId: s.type === 'PRODUCT' ? s.id : null,
          currentStock,
          thresholdMin,
          unitPurchase: s.unitPurchase,
          suggestedQty,
          estUnitCost,
          estTotal,
        },
      });
      createdCount++;

      await this.audit.log({
        userId: systemUserId,
        action: 'PURCHASE_SUGGESTION_CREATED',
        entityType: 'purchase_suggestion',
        entityId: created.id,
        metadata: {
          stockableType: s.type,
          stockableId: s.id,
          stockableName: s.name,
          currentStock,
          thresholdMin,
          suggestedQty,
          estTotal,
        },
      });
    }

    // Stale: sugerencias activas cuya entidad ya no está bajo threshold
    let staledCount = 0;
    for (const sugg of activeSuggestions) {
      const key =
        sugg.entityType === 'INGREDIENT'
          ? `INGREDIENT:${sugg.ingredientId}`
          : `PRODUCT:${sugg.productId}`;
      if (lowStockKeys.has(key)) continue;

      await this.prisma.purchaseSuggestion.update({
        where: { id: sugg.id },
        data: {
          status: 'STALE',
          resolvedAt: scannedAt,
          resolutionNote: 'Stock se repuso (auto-stale)',
        },
      });
      staledCount++;

      await this.audit.log({
        userId: systemUserId,
        action: 'PURCHASE_SUGGESTION_STALE',
        entityType: 'purchase_suggestion',
        entityId: sugg.id,
      });
    }

    this.logger.log(
      `Scan ${scannedAt.toISOString()}: ${stockables.length} stockables ` +
        `→ ${createdCount} suggestions created, ${staledCount} staled`,
    );

    return {
      scannedAt: scannedAt.toISOString(),
      scannedCount: stockables.length,
      createdCount,
      staledCount,
    };
  }

  // ==================================================================
  // QUERY
  // ==================================================================

  async list(filter: ListFilter = {}): Promise<PurchaseSuggestion[]> {
    const where: Prisma.PurchaseSuggestionWhereInput = {};
    if (filter.status) {
      where.status = Array.isArray(filter.status)
        ? { in: filter.status }
        : filter.status;
    }
    const rows = await this.prisma.purchaseSuggestion.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });
    return rows.map(toDto);
  }

  async getById(id: string): Promise<PurchaseSuggestion> {
    const row = await this.prisma.purchaseSuggestion.findUnique({
      where: { id },
      include: includeFull(),
    });
    if (!row) throw new NotFoundException(`Suggestion ${id} not found`);
    return toDto(row);
  }

  // ==================================================================
  // LLM EVALUATION (FASE 12.D)
  // ==================================================================

  /**
   * Llena `llmRationale` + `llmModel` + `llmEvaluatedAt` en la sugerencia
   * y la pasa de PENDING → EVALUATED. Carga histórico de compras (últimos
   * 10 invoice items del mismo stockable) para que el LLM tenga contexto.
   *
   * Si la sugerencia ya está EVALUATED, re-evalúa (sobrescribe rationale
   * + actualiza llmEvaluatedAt). En estados terminales rechaza con 400.
   */
  async evaluate(id: string, userId: string): Promise<PurchaseSuggestion> {
    const existing = await this.prisma.purchaseSuggestion.findUnique({
      where: { id },
      include: includeFull(),
    });
    if (!existing) throw new NotFoundException(`Suggestion ${id} not found`);
    if (
      existing.status !== 'PENDING' &&
      existing.status !== 'EVALUATED'
    ) {
      throw new BadRequestException(
        `Suggestion already resolved (status=${existing.status})`,
      );
    }

    // Histórico: invoice_items confirmados del mismo stockable, máx 10.
    const itemWhere: Prisma.InvoiceItemWhereInput =
      existing.entityType === 'INGREDIENT'
        ? { ingredientId: existing.ingredientId, invoice: { status: 'CONFIRMED' } }
        : { productId: existing.productId, invoice: { status: 'CONFIRMED' } };
    const items = await this.prisma.invoiceItem.findMany({
      where: itemWhere,
      orderBy: { invoice: { createdAt: 'desc' } },
      take: 10,
      select: {
        quantity: true,
        unit: true,
        unitPrice: true,
        invoice: {
          select: {
            createdAt: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    const itemName =
      existing.entityType === 'INGREDIENT'
        ? (existing.ingredient?.name ?? '(insumo eliminado)')
        : (existing.product?.name ?? '(producto eliminado)');
    const unitStock =
      existing.entityType === 'INGREDIENT'
        ? 'unidad receta'
        : 'unidad';

    const userPrompt = buildPurchaseSuggestionUserPrompt({
      itemName,
      unitPurchase: existing.unitPurchase,
      currentStock: Number(existing.currentStock),
      thresholdMin: Number(existing.thresholdMin),
      unitStock,
      suggestedQty: Number(existing.suggestedQty),
      estUnitCost: existing.estUnitCost === null ? null : Number(existing.estUnitCost),
      estTotal: existing.estTotal === null ? null : Number(existing.estTotal),
      history: items.map((it) => ({
        date: it.invoice.createdAt.toISOString().slice(0, 10),
        supplierName: it.invoice.supplier?.name ?? '(sin proveedor)',
        qty: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
      })),
    });

    const { rationale, modelUsed } = await this.llm.evaluatePurchaseSuggestion({
      userPrompt,
    });

    const updated = await this.prisma.purchaseSuggestion.update({
      where: { id },
      data: {
        llmRationale: rationale,
        llmModel: modelUsed,
        llmEvaluatedAt: new Date(),
        status: 'EVALUATED',
      },
      include: includeFull(),
    });

    await this.audit.log({
      userId,
      action: 'PURCHASE_SUGGESTION_EVALUATED',
      entityType: 'purchase_suggestion',
      entityId: id,
      metadata: {
        modelUsed,
        historySize: items.length,
        rationaleLen: rationale.length,
      },
    });

    return toDto(updated);
  }

  /** Evaluar todas las PENDING sin rationale. Útil como botón "evaluar todas". */
  async evaluateAllPending(userId: string): Promise<{
    evaluated: number;
    failed: number;
  }> {
    const pending = await this.prisma.purchaseSuggestion.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
    });
    let evaluated = 0;
    let failed = 0;
    for (const p of pending) {
      try {
        await this.evaluate(p.id, userId);
        evaluated++;
      } catch (e) {
        failed++;
        this.logger.warn(
          `evaluateAllPending: ${p.id} failed: ${(e as Error).message}`,
        );
      }
    }
    return { evaluated, failed };
  }

  // ==================================================================
  // RESOLUTIONS
  // ==================================================================

  async accept(
    id: string,
    userId: string,
    input: ResolveSuggestion = {},
  ): Promise<PurchaseSuggestion> {
    return this.resolve(id, userId, 'ACCEPTED', input.note);
  }

  async reject(
    id: string,
    userId: string,
    input: ResolveSuggestion = {},
  ): Promise<PurchaseSuggestion> {
    return this.resolve(id, userId, 'REJECTED', input.note);
  }

  private async resolve(
    id: string,
    userId: string,
    status: 'ACCEPTED' | 'REJECTED',
    note: string | undefined,
  ): Promise<PurchaseSuggestion> {
    const existing = await this.prisma.purchaseSuggestion.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Suggestion ${id} not found`);
    if (existing.status !== 'PENDING' && existing.status !== 'EVALUATED') {
      throw new BadRequestException(
        `Suggestion already resolved (status=${existing.status})`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.purchaseSuggestion.update({
      where: { id },
      data: {
        status,
        resolvedById: userId,
        resolvedAt: now,
        resolutionNote: note ?? null,
      },
      include: includeFull(),
    });

    await this.audit.log({
      userId,
      action:
        status === 'ACCEPTED'
          ? 'PURCHASE_SUGGESTION_ACCEPTED'
          : 'PURCHASE_SUGGESTION_REJECTED',
      entityType: 'purchase_suggestion',
      entityId: id,
      metadata: note ? { note } : undefined,
    });

    return toDto(updated);
  }

  // ==================================================================
  // PROVEEDORES: histórico + envío por WhatsApp
  // ==================================================================

  /**
   * Devuelve los proveedores que alguna vez vendieron el item de la sugerencia.
   * Ordenado por última compra DESC. Marca el más reciente como `isLast=true`
   * (la UI lo usa como default en el selector).
   */
  async listSuppliersFor(suggestionId: string): Promise<HistoricalSupplier[]> {
    const s = await this.prisma.purchaseSuggestion.findUnique({
      where: { id: suggestionId },
      select: { entityType: true, ingredientId: true, productId: true },
    });
    if (!s) throw new NotFoundException(`Suggestion ${suggestionId} not found`);

    const rows = await this.prisma.supplierProduct.findMany({
      where:
        s.entityType === 'INGREDIENT'
          ? { ingredientId: s.ingredientId! }
          : { productId: s.productId! },
      include: {
        supplier: { select: { id: true, name: true, phone: true, isActive: true } },
      },
      orderBy: [{ lastPurchaseDate: 'desc' }, { updatedAt: 'desc' }],
    });

    if (rows.length === 0) return [];
    const lastId = rows[0].supplierId;
    return rows.map((r) => ({
      supplierId: r.supplier.id,
      name: r.supplier.name,
      phone: r.supplier.phone,
      isActive: r.supplier.isActive,
      lastUnitPrice: r.lastUnitPrice === null ? null : Number(r.lastUnitPrice),
      lastPurchaseDate: r.lastPurchaseDate ? r.lastPurchaseDate.toISOString() : null,
      isLast: r.supplierId === lastId,
    }));
  }

  /**
   * Envía el pedido al proveedor por WhatsApp y marca la sugerencia ACCEPTED.
   * Si el proveedor no tiene `phone` configurado → falla con BadRequest.
   */
  async sendToSupplier(
    suggestionId: string,
    input: SendToSupplier,
    actorId: string,
  ): Promise<{ outcome: WhatsAppSendOutcome; suggestion: PurchaseSuggestion }> {
    const sugg = await this.prisma.purchaseSuggestion.findUnique({
      where: { id: suggestionId },
      include: includeFull(),
    });
    if (!sugg) throw new NotFoundException(`Suggestion ${suggestionId} not found`);
    if (sugg.status !== 'PENDING' && sugg.status !== 'EVALUATED') {
      throw new BadRequestException(`Suggestion already resolved (status=${sugg.status})`);
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true, name: true, phone: true },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${input.supplierId} not found`);
    if (!supplier.phone) {
      throw new BadRequestException(
        `El proveedor "${supplier.name}" no tiene WhatsApp configurado. Editalo desde Compras → Proveedores.`,
      );
    }

    const itemName =
      sugg.entityType === 'INGREDIENT'
        ? (sugg.ingredient?.name ?? '(insumo)')
        : (sugg.product?.name ?? '(producto)');
    const quantity = input.quantity ?? Number(sugg.suggestedQty);
    const message = buildSupplierOrderMessage({
      itemName,
      quantity,
      unitPurchase: sugg.unitPurchase,
      note: input.note,
    });

    const phoneE164 = normalizePhone(supplier.phone);
    const result = await this.whatsapp.sendText(phoneE164, message);
    const ok = result.ok;

    // Marcar la sugerencia como ACCEPTED.
    const updated = await this.prisma.purchaseSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'ACCEPTED',
        resolvedById: actorId,
        resolvedAt: new Date(),
        resolutionNote: `Pedido enviado a ${supplier.name} por WhatsApp${
          input.note ? ` · ${input.note}` : ''
        }`,
      },
      include: includeFull(),
    });
    await this.audit.log({
      userId: actorId,
      action: 'PURCHASE_SUGGESTION_SENT_SUPPLIER',
      entityType: 'purchase_suggestion',
      entityId: suggestionId,
      metadata: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        phone: phoneE164,
        quantity,
        ok: result.ok,
        error: result.error ?? null,
      },
    });

    return {
      outcome: {
        sent: ok ? 1 : 0,
        failed: ok ? 0 : 1,
        recipients: [
          {
            name: supplier.name,
            phone: phoneE164,
            status: ok ? 'sent' : 'failed',
            reason: result.error,
          },
        ],
        preview: message,
      },
      suggestion: toDto(updated),
    };
  }

  /**
   * Manda un resumen de TODAS las sugerencias activas (PENDING + EVALUATED) a
   * los WhatsApp de Dueños y Admins Operativos activos que tengan teléfono.
   * Útil para "atención: estos pedidos están pendientes de gestionar".
   */
  async sendSummaryToAdmins(actorId: string): Promise<WhatsAppSendOutcome> {
    const open = await this.prisma.purchaseSuggestion.findMany({
      where: { status: { in: ['PENDING', 'EVALUATED'] } },
      include: includeFull(),
      orderBy: { createdAt: 'asc' },
    });

    if (open.length === 0) {
      return {
        sent: 0,
        failed: 0,
        recipients: [],
        preview: 'No hay sugerencias pendientes — no se envió nada.',
      };
    }

    const admins = await this.prisma.user.findMany({
      where: { active: true, role: { in: ['DUENO', 'ADMIN_OPERATIVO'] } },
      select: { id: true, fullName: true, phone: true },
    });

    const lines = open.map((s) => {
      const name =
        s.entityType === 'INGREDIENT'
          ? (s.ingredient?.name ?? '(insumo)')
          : (s.product?.name ?? '(producto)');
      const qty = Number(s.suggestedQty);
      const cost = s.estTotal === null ? '' : ` · ~$${Math.round(Number(s.estTotal)).toLocaleString('es-CO')}`;
      return `• ${name}: ${qty} ${s.unitPurchase}${cost}`;
    });
    const total = open.reduce((acc, s) => acc + (s.estTotal === null ? 0 : Number(s.estTotal)), 0);
    const message = [
      '📋 *Compras pendientes de gestionar*',
      '',
      ...lines,
      '',
      `Total estimado: $${Math.round(total).toLocaleString('es-CO')}`,
      `(${open.length} ${open.length === 1 ? 'sugerencia abierta' : 'sugerencias abiertas'})`,
    ].join('\n');

    const recipients: WhatsAppSendOutcome['recipients'] = [];
    let sent = 0;
    let failed = 0;

    for (const a of admins) {
      if (!a.phone) {
        recipients.push({
          name: a.fullName,
          phone: '—',
          status: 'skipped',
          reason: 'sin teléfono cargado',
        });
        continue;
      }
      const phoneE164 = normalizePhone(a.phone);
      const res = await this.whatsapp.sendText(phoneE164, message);
      const ok = res.ok;
      if (ok) sent += 1;
      else failed += 1;
      recipients.push({
        name: a.fullName,
        phone: phoneE164,
        status: ok ? 'sent' : 'failed',
        reason: res.error,
      });
    }

    await this.audit.log({
      userId: actorId,
      action: 'PURCHASE_SUGGESTION_SUMMARY_SENT',
      entityType: 'purchase_suggestion',
      metadata: { suggestions: open.length, sent, failed, total },
    });

    return { sent, failed, recipients, preview: message };
  }
}

/** Texto del mensaje al proveedor (sencillo y directo). */
function buildSupplierOrderMessage(input: {
  itemName: string;
  quantity: number;
  unitPurchase: string;
  note?: string;
}): string {
  const qty = Number(input.quantity).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const lines = [
    'Hola! Quisiera hacer un pedido:',
    '',
    `• ${input.itemName}: ${qty} ${input.unitPurchase}`,
  ];
  if (input.note) lines.push('', input.note);
  lines.push('', 'Gracias!');
  return lines.join('\n');
}

/** Normaliza teléfono a E.164 colombiano cuando es razonable. Best-effort. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+57${digits}`;
  if (digits.startsWith('57') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

// ====================================================================
// HELPERS
// ====================================================================

function computeSuggestedQty(
  thresholdMin: number,
  currentStock: number,
  conversionFactor: number | null,
): number {
  // Refill target: 2× threshold (queda con 1 threshold de buffer post-compra).
  const targetStockUnits = thresholdMin * 2;
  const deficitStockUnits = Math.max(targetStockUnits - currentStock, 0);
  const factor = conversionFactor && conversionFactor > 0 ? conversionFactor : 1;
  const purchaseQty = deficitStockUnits / factor;
  // Redondear al entero superior — no se compran fracciones de caja/bolsa.
  // Mínimo 1 (la sugerencia tiene sentido si hay déficit).
  return Math.max(Math.ceil(purchaseQty), 1);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function includeFull() {
  return {
    ingredient: { select: { name: true } },
    product: { select: { name: true } },
    resolvedBy: { select: { fullName: true } },
  } satisfies Prisma.PurchaseSuggestionInclude;
}

function toDto(row: DbSuggestionWithRelations): PurchaseSuggestion {
  const entityName =
    row.entityType === 'INGREDIENT'
      ? (row.ingredient?.name ?? '(insumo eliminado)')
      : (row.product?.name ?? '(producto eliminado)');
  return {
    id: row.id,
    entityType: row.entityType,
    ingredientId: row.ingredientId,
    productId: row.productId,
    entityName,
    unitPurchase: row.unitPurchase,
    currentStock: Number(row.currentStock),
    thresholdMin: Number(row.thresholdMin),
    suggestedQty: Number(row.suggestedQty),
    estUnitCost: row.estUnitCost === null ? null : Number(row.estUnitCost),
    estTotal: row.estTotal === null ? null : Number(row.estTotal),
    llmRationale: row.llmRationale,
    llmModel: row.llmModel,
    llmEvaluatedAt: row.llmEvaluatedAt
      ? row.llmEvaluatedAt.toISOString()
      : null,
    status: row.status,
    resolvedById: row.resolvedById,
    resolvedByName: row.resolvedBy?.fullName ?? null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
  };
}
