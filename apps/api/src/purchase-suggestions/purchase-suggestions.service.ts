import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  buildOwnerAlert,
  buildPurchaseSuggestionUserPrompt,
  computeSuggestedPurchase,
  normalizeConversionFactor,
  buildSupplierOrderMessage,
  normalizeWaPhone,
  roundMoney,
  toWaLink,
  type WhatsAppProvider,
  buildLowStockAlertMessage,
  type LowStockAlertItem,
} from '@pos-tercos/domain';
import type {
  EvaluateAllResult,
  HistoricalSupplier,
  PurchaseSuggestion,
  PurchaseSuggestionStatus,
  ResolveSuggestion,
  ScanResult,
  SendToSupplier,
  SupplierOrderLink,
  WhatsAppSendOutcome,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { describeLlmFailure } from '../adapters/llm/llm-failure';
import { LLMService } from '../adapters/llm/llm.service';
import { WHATSAPP_PROVIDER } from '../adapters/whatsapp/whatsapp.module';
import { AuditService } from '../audit/audit.service';
import { BusinessConfigService } from '../business-config/business-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { businessName } from '../common/business-name';
import { localMidnightOfYmd, ymdLocal } from '../common/local-dates';

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

/** Ítems que caben en el resumen por WhatsApp sin pasarse del largo máximo. */
const MAX_LINEAS_RESUMEN = 40;
/**
 * Cuántos insumos entran en el aviso de stock bajo. Una notificación del
 * navegador muestra unas pocas líneas antes de cortar; más allá de esto el
 * mensaje deja de decir algo y solo hay que abrir la pantalla.
 */
const MAX_LINEAS_AVISO_STOCK = 6;

/**
 * Cuánto esperar antes de volver a sugerir un ítem que ya se resolvió.
 *
 * Sin esto, resolver una sugerencia NO servía de nada: el escaneo de la hora
 * siguiente veía el stock todavía bajo (obvio: el pedido no ha llegado) y la
 * creaba de nuevo. Aceptar "ya se lo pedí al proveedor" o rechazar "no lo voy
 * a comprar" no tenía ningún efecto duradero.
 *
 * ACEPTADA = hay un pedido en camino. Se re-pregunta a los 2 días porque a esa
 * altura o llegó (y el stock subió, así que no se sugiere nada) o el proveedor
 * incumplió y hay que volver a moverlo.
 *
 * RECHAZADA = decisión de no comprar. Se respeta el resto del día y se vuelve
 * a preguntar al siguiente: la razón para no comprar suele vencerse.
 */
/** Evaluaciones por corrida: cada una es una llamada al modelo. */
const MAX_EVALUACIONES_POR_CORRIDA = 25;

const REPREGUNTAR_TRAS_ACEPTAR_HS = 48;
const REPREGUNTAR_TRAS_RECHAZAR_HS = 24;

/**
 * Textos que ve la persona. Antes decían "Suggestion already resolved
 * (status=ACCEPTED)" y "Suggestion 8f3a-… not found": inglés, nombre de estado
 * interno y UUID en pantalla (§3).
 */
const YA_RESUELTA =
  'Esta sugerencia ya fue resuelta por alguien más. Recarga la página para ver cómo quedó.';
const NO_EXISTE =
  'No encontramos esa sugerencia. Puede que ya no exista o que el enlace esté viejo.';

@Injectable()
export class PurchaseSuggestionsService {
  private readonly logger = new Logger(PurchaseSuggestionsService.name);
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly llm: LLMService,
    private readonly businessConfig: BusinessConfigService,
    private readonly ownerNotifications: OwnerNotificationService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  // ==================================================================
  // SCAN — detección horaria de bajo stock + creación de sugerencias
  // ==================================================================

  /**
   * Cron horario (top of hour). El audit log queda con userId=null porque no
   * hay actor humano: lo dispara el scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runScanScheduled(): Promise<void> {
    try {
      await this.runScan(null);
    } catch (e) {
      // No re-lanzar: el cron no tiene supervisor que reintente. runScan ya
      // logueó si fue un skip por solapamiento.
      this.logger.error(
        `Scan cron failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
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
    // Guard de re-entrada COMPARTIDO entre el cron y el endpoint manual del
    // Dueño: el dedupe (check-then-insert sin unique en DB) no es atómico, así
    // que dos scans solapados crearían sugerencias PENDING duplicadas del
    // mismo stockable (auditoría 2026-07-05). Con el guard acá, "escanear
    // ahora" mientras corre el cron devuelve el resultado vacío sin duplicar.
    if (this.scanning) {
      this.logger.warn('scan ya en curso — se omite esta corrida');
      // `skipped` para que la pantalla no reporte "0 revisados · 0 nuevas"
      // como si hubiera revisado y no encontrado nada: no revisó nada.
      return {
        scannedAt: new Date().toISOString(),
        scannedCount: 0,
        createdCount: 0,
        staledCount: 0,
        failedCount: 0,
        skipped: true,
      };
    }
    this.scanning = true;
    try {
      return await this.doRunScan(systemUserId);
    } finally {
      this.scanning = false;
    }
  }

  private async doRunScan(systemUserId: string | null): Promise<ScanResult> {
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
    const keyOf = (x: {
      entityType: string;
      ingredientId: string | null;
      productId: string | null;
    }): string =>
      x.entityType === 'INGREDIENT'
        ? `INGREDIENT:${x.ingredientId}`
        : `PRODUCT:${x.productId}`;

    const activeKeySet = new Set(activeSuggestions.map(keyOf));

    // Ítems resueltos hace poco: no se vuelven a sugerir todavía (ver las
    // constantes de arriba). Sin esto, aceptar o rechazar no tenía efecto.
    const recentlyResolved = await this.prisma.purchaseSuggestion.findMany({
      where: {
        OR: [
          {
            status: 'ACCEPTED',
            resolvedAt: { gte: hoursAgo(scannedAt, REPREGUNTAR_TRAS_ACEPTAR_HS) },
          },
          {
            status: 'REJECTED',
            resolvedAt: { gte: hoursAgo(scannedAt, REPREGUNTAR_TRAS_RECHAZAR_HS) },
          },
        ],
      },
      select: { entityType: true, ingredientId: true, productId: true },
    });
    const onCooldownKeySet = new Set(recentlyResolved.map(keyOf));

    let createdCount = 0;
    const lowStockKeys = new Set<string>();
    /**
     * Solo lo detectado en ESTA corrida. El escaneo corre cada hora y un insumo
     * se queda bajo mínimo durante días: avisar de todo lo que sigue bajo
     * convertiría el aviso en ruido horario y dejaría de leerse. Como una
     * sugerencia abierta no se vuelve a crear, el anti-spam sale del dedupe que
     * ya existía.
     */
    const nuevosBajoMinimo: LowStockAlertItem[] = [];

    let failedCount = 0;

    for (const s of stockables) {
      // Los subproductos NO se compran: se PRODUCEN en cocina. Su faltante se
      // atiende en Producción, no con un pedido a un proveedor — y la tabla
      // solo acepta insumo o producto (CHECK chk_purchase_sugg_polymorphic).
      // Sin este salto, un subproducto bajo mínimo tumbaba el escaneo entero
      // con un 500 y la funcionalidad quedaba muerta.
      if (s.type === 'SUBPRODUCT') continue;

      const thresholdMin = s.thresholdMin;
      if (thresholdMin <= 0) continue;
      const currentStock = s.currentStock;
      const key = `${s.type}:${s.id}`;

      if (currentStock >= thresholdMin) continue;
      lowStockKeys.add(key);

      if (activeKeySet.has(key)) continue; // ya hay sugerencia abierta
      if (onCooldownKeySet.has(key)) continue; // se resolvió hace poco

      const { suggestedQty } = computeSuggestedPurchase({
        currentStock,
        thresholdMin,
        conversionFactor: s.conversionFactor,
      });
      const estUnitCost = costMap.get(key) ?? null;
      const estTotal =
        estUnitCost === null ? null : roundMoney(suggestedQty * estUnitCost);

      // Un item que falla no puede llevarse el escaneo entero por delante: el
      // resto de las sugerencias del día se perdería y la marca de vencidas
      // (que va después del bucle) nunca correría.
      try {
        const created = await this.prisma.purchaseSuggestion.create({
          data: {
            entityType: s.type,
            ingredientId: s.type === 'INGREDIENT' ? s.id : null,
            productId: s.type === 'PRODUCT' ? s.id : null,
            currentStock,
            thresholdMin,
            unitPurchase: s.unitPurchase,
            unitStock: s.unitStock,
            conversionFactor: s.conversionFactor,
            suggestedQty,
            estUnitCost,
            estTotal,
          },
        });
        createdCount++;
        nuevosBajoMinimo.push({
          name: s.name,
          currentStock,
          thresholdMin,
          unitStock: s.unitStock,
        });

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
      } catch (e) {
        failedCount++;
        this.logger.error(
          `scan: no se pudo crear la sugerencia de ${s.type} ${s.name} (${s.id}): ${(e as Error).message}`,
        );
      }
    }

    // Stale: sugerencias activas cuya entidad ya no está bajo threshold
    let staledCount = 0;
    for (const sugg of activeSuggestions) {
      const key =
        sugg.entityType === 'INGREDIENT'
          ? `INGREDIENT:${sugg.ingredientId}`
          : `PRODUCT:${sugg.productId}`;
      if (lowStockKeys.has(key)) continue;

      try {
        await this.prisma.purchaseSuggestion.update({
          where: { id: sugg.id },
          data: {
            status: 'STALE',
            resolvedAt: scannedAt,
            // No siempre se repuso: también entra acá un insumo desactivado o
          // con el mínimo puesto en 0. Afirmar "se repuso" falsearía el
          // historial de quien audite después.
          resolutionNote: 'Cerrada automáticamente: el ítem ya no está bajo el mínimo',
          },
        });
        staledCount++;

        await this.audit.log({
          userId: systemUserId,
          action: 'PURCHASE_SUGGESTION_STALE',
          entityType: 'purchase_suggestion',
          entityId: sugg.id,
        });
      } catch (e) {
        failedCount++;
        this.logger.error(
          `scan: no se pudo marcar como vencida la sugerencia ${sugg.id}: ${(e as Error).message}`,
        );
      }
    }

    this.notifyLowStock(nuevosBajoMinimo);

    this.logger.log(
      `Scan ${scannedAt.toISOString()}: ${stockables.length} stockables ` +
        `→ ${createdCount} suggestions created, ${staledCount} staled, ${failedCount} failed`,
    );

    return {
      scannedAt: scannedAt.toISOString(),
      scannedCount: stockables.length,
      createdCount,
      staledCount,
      failedCount,
      skipped: false,
    };
  }

  /**
   * Avisa de los insumos que ACABAN de cruzar el mínimo. Fire-and-forget: un
   * fallo del aviso jamás puede tumbar el escaneo ni el cron que lo dispara.
   */
  private notifyLowStock(items: LowStockAlertItem[]): void {
    if (items.length === 0) return;
    // Una lista larga no entra en una notificación y tampoco se lee: se
    // muestran las primeras y se DICE cuántas quedaron fuera.
    const mostradas = items.slice(0, MAX_LINEAS_AVISO_STOCK);
    void this.ownerNotifications.alert(
      'low_stock',
      buildLowStockAlertMessage({
        businessName: businessName(),
        items: mostradas,
        hiddenCount: items.length - mostradas.length,
      }),
      { itemCount: items.length },
    );
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
    if (!row) throw new NotFoundException(NO_EXISTE);
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
    if (!existing) throw new NotFoundException(NO_EXISTE);
    if (
      existing.status !== 'PENDING' &&
      existing.status !== 'EVALUATED'
    ) {
      throw new BadRequestException(YA_RESUELTA);
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
    // La unidad REAL del inventario (g, unidad). Antes iba fija en "unidad
    // receta" y el modelo no podía distinguir 2.500 gramos de 2.500 kilos, ni
    // relacionarlo con el histórico de compras, que sí trae unidades de verdad.
    const unitStock = existing.unitStock ?? existing.unitPurchase;

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
        date: ymdLocal(it.invoice.createdAt),
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

  /**
   * Evaluar todas las PENDING sin rationale. Útil como botón "evaluar todas".
   *
   * Devuelve el MOTIVO de los fallos, no solo cuántos: la causa casi siempre
   * es la misma para todas (no hay llave de IA configurada, se acabó el saldo)
   * y sin ese dato "3 fallaron" no le dice a nadie qué hacer.
   */
  async evaluateAllPending(userId: string): Promise<EvaluateAllResult> {
    // Tope por corrida: cada evaluación es una llamada al modelo (~segundos y
    // plata). Sin límite, 60 pendientes tardaban minutos, el navegador cortaba
    // la petición y quien mirara volvía a tocar el botón mientras el servidor
    // seguía gastando. Lo que queda fuera se DICE, no se recorta en silencio.
    const pending = await this.prisma.purchaseSuggestion.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_EVALUACIONES_POR_CORRIDA + 1,
    });
    const quedanFuera = Math.max(pending.length - MAX_EVALUACIONES_POR_CORRIDA, 0);
    pending.length = Math.min(pending.length, MAX_EVALUACIONES_POR_CORRIDA);
    let evaluated = 0;
    let failed = 0;
    const reasons = new Set<string>();
    for (const p of pending) {
      try {
        await this.evaluate(p.id, userId);
        evaluated++;
      } catch (e) {
        failed++;
        // No todo fallo es de la IA: si alguien resolvió la sugerencia entre
        // la consulta y la evaluación, el error es de negocio. Echarle la
        // culpa al modelo mandaba a revisar la llave por nada.
        const reason =
          e instanceof BadRequestException || e instanceof NotFoundException
            ? 'Alguna sugerencia se resolvió mientras se evaluaba, así que se saltó.'
            : describeLlmFailure(e);
        reasons.add(reason);
        this.logger.warn(
          `evaluateAllPending: ${p.id} failed: ${(e as Error).message}`,
        );
      }
    }
    if (quedanFuera > 0) {
      reasons.add(
        `Quedaron ${quedanFuera} sin evaluar en esta corrida. Vuelve a tocar el botón para seguir.`,
      );
    }
    return { evaluated, failed, errors: [...reasons] };
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
    if (!existing) throw new NotFoundException(NO_EXISTE);
    if (existing.status !== 'PENDING' && existing.status !== 'EVALUATED') {
      throw new BadRequestException(YA_RESUELTA);
    }

    // Claim condicionado por estado: si otra persona resolvió la sugerencia
    // entre la lectura y esta escritura, el update no toca nada y salimos sin
    // auditar. Antes ambos escribían y el registro quedaba con un ACEPTADA y
    // un RECHAZADA para la misma sugerencia.
    const now = new Date();
    const claim = await this.prisma.purchaseSuggestion.updateMany({
      where: { id, status: { in: ['PENDING', 'EVALUATED'] } },
      data: {
        status,
        resolvedById: userId,
        resolvedAt: now,
        resolutionNote: note ?? null,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException(YA_RESUELTA);
    }
    const updated = await this.prisma.purchaseSuggestion.findUniqueOrThrow({
      where: { id },
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
    if (!s) throw new NotFoundException(NO_EXISTE);

    const rows = await this.prisma.supplierProduct.findMany({
      where:
        s.entityType === 'INGREDIENT'
          ? { ingredientId: s.ingredientId! }
          : { productId: s.productId! },
      include: {
        supplier: { select: { id: true, name: true, phone: true, isActive: true } },
      },
      // NULLS LAST explícito: en Postgres, DESC pone los nulos PRIMERO, así
      // que un proveedor sin fecha de compra se coronaría "el más reciente".
      orderBy: [
        { lastPurchaseDate: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
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
   * Arma el pedido al proveedor: texto + link `wa.me`. NO envía nada — quien
   * compra lo abre en SU WhatsApp y lo manda (puede editarlo antes). Read-only:
   * la UI lo llama cada vez que cambian proveedor, cantidad o nota.
   */
  async buildSupplierOrder(
    suggestionId: string,
    input: SendToSupplier,
    actorId: string,
  ): Promise<SupplierOrderLink> {
    const { sugg, supplier } = await this.loadOrderContext(suggestionId, input.supplierId);

    const itemName =
      sugg.entityType === 'INGREDIENT'
        ? (sugg.ingredient?.name ?? '(insumo)')
        : (sugg.product?.name ?? '(producto)');
    const quantity = input.quantity ?? Number(sugg.suggestedQty);

    const [config, actor] = await Promise.all([
      this.businessConfig.get(),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } }),
    ]);

    const message = buildSupplierOrderMessage({
      supplierPhone: supplier.phone,
      supplierName: supplier.name,
      businessName: businessName(),
      neededByLabel: input.neededBy ? formatNeededByLabel(input.neededBy) : null,
      requestedBy: actor?.fullName ?? null,
      businessPhoneDisplay: config.phoneDisplay || config.phone || null,
      deliveryAddress: config.address || null,
      note: input.note,
      items: [{ name: itemName, quantity, unitPurchase: sugg.unitPurchase }],
    });

    const phone = normalizeWaPhone(supplier.phone);

    // Mismo pedido en formato documento. Se arma acá —y no en la pantalla—
    // porque los datos del negocio viven en la configuración del servidor: si
    // el papel y el WhatsApp se armaran por separado terminarían diciendo
    // cosas distintas.
    const factor = normalizeConversionFactor(
      sugg.conversionFactor === null ? null : Number(sugg.conversionFactor),
    );
    const unitStock = sugg.unitStock ?? sugg.unitPurchase;
    const estUnitCost =
      sugg.estUnitCost === null ? null : Number(sugg.estUnitCost);
    const lineTotal =
      estUnitCost === null ? null : roundMoney(quantity * estUnitCost);

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      phone,
      url: phone ? toWaLink(phone, message).url : null,
      messagePlain: message,
      document: {
        businessName: businessName(),
        businessPhone: config.phoneDisplay || config.phone || null,
        businessAddress: config.address || null,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        issuedOnLabel: formatLongDate(new Date()),
        neededByLabel: input.neededBy ? formatNeededByLabel(input.neededBy) : null,
        requestedBy: actor?.fullName ?? null,
        note: input.note ?? null,
        items: [
          {
            name: itemName,
            quantity,
            unitPurchase: sugg.unitPurchase,
            equivalence:
              factor === 1 && unitStock === sugg.unitPurchase
                ? null
                : `${(quantity * factor).toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${unitStock}`,
            estTotal: lineTotal,
          },
        ],
        estTotal: lineTotal,
      },
    };
  }

  /**
   * Marca la sugerencia ACCEPTED tras abrir el chat del proveedor. Se llama en
   * el mismo click que abre WhatsApp: el sistema no puede saber si el mensaje
   * se envió de verdad, y perseguirlo no vale la pena — quien compra siempre
   * puede rechazar o volver a pedir.
   */
  async markOrderedToSupplier(
    suggestionId: string,
    input: SendToSupplier,
    actorId: string,
  ): Promise<{ link: SupplierOrderLink; suggestion: PurchaseSuggestion }> {
    const link = await this.buildSupplierOrder(suggestionId, input, actorId);
    // Sin teléfono no hubo chat que abrir: marcar ACCEPTED con nota "pedido por
    // WhatsApp" sería mentira. La UI ya deshabilita el botón; esto cubre el API.
    if (!link.url) {
      throw new BadRequestException(
        'El proveedor no tiene teléfono. Agrégalo en Proveedores para poder abrir el chat.',
      );
    }
    // Con unidad y la fecha en palabras: "20" a secas no dice si son kilos o
    // paquetes, y "2026-08-26" no se lee.
    const pedido = link.document.items[0];
    const detail = [
      pedido ? `${pedido.quantity} ${pedido.unitPurchase}` : null,
      input.neededBy ? `para el ${formatNeededByLabel(input.neededBy)}` : null,
      input.note ?? null,
    ]
      .filter(Boolean)
      .join(' · ');

    const updated = await this.prisma.purchaseSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'ACCEPTED',
        resolvedById: actorId,
        resolvedAt: new Date(),
        resolutionNote: `Pedido a ${link.supplierName} por WhatsApp${detail ? ` · ${detail}` : ''}`,
      },
      include: includeFull(),
    });
    await this.audit.log({
      userId: actorId,
      action: 'PURCHASE_SUGGESTION_SENT_SUPPLIER',
      entityType: 'purchase_suggestion',
      entityId: suggestionId,
      metadata: {
        supplierId: link.supplierId,
        supplierName: link.supplierName,
        phone: link.phone,
        quantity: input.quantity ?? null,
        neededBy: input.neededBy ?? null,
        channel: 'wa_link',
        message: link.messagePlain,
      },
    });

    return { link, suggestion: toDto(updated) };
  }

  /** Sugerencia sin resolver + proveedor existente. Lanza si algo no cuadra. */
  private async loadOrderContext(suggestionId: string, supplierId: string) {
    const sugg = await this.prisma.purchaseSuggestion.findUnique({
      where: { id: suggestionId },
      include: includeFull(),
    });
    if (!sugg) throw new NotFoundException(NO_EXISTE);
    if (sugg.status !== 'PENDING' && sugg.status !== 'EVALUATED') {
      throw new BadRequestException(YA_RESUELTA);
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, phone: true },
    });
    if (!supplier) throw new NotFoundException('Ese proveedor ya no existe. Elige otro de la lista.');

    return { sugg, supplier };
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
        preview: 'No hay sugerencias abiertas — no se envió nada.',
      };
    }

    const admins = await this.prisma.user.findMany({
      where: { active: true, role: { in: ['DUENO', 'ADMIN_OPERATIVO'] } },
      select: { id: true, fullName: true, phone: true },
    });

    // Un mensaje de WhatsApp tiene tope de largo: con muchas sugerencias
    // abiertas el envío falla ENTERO. Se acota y se DICE cuántas quedaron
    // fuera — un recorte silencioso se lee como "esas son todas".
    const mostradas = open.slice(0, MAX_LINEAS_RESUMEN);
    const ocultas = open.length - mostradas.length;

    const lines = mostradas.map((s) => {
      const name =
        s.entityType === 'INGREDIENT'
          ? (s.ingredient?.name ?? '(insumo)')
          : (s.product?.name ?? '(producto)');
      const qty = Number(s.suggestedQty);
      const cost = s.estTotal === null ? '' : ` · ~$${Math.round(Number(s.estTotal)).toLocaleString('es-CO')}`;
      return `• ${name}: ${qty} ${s.unitPurchase}${cost}`;
    });
    if (ocultas > 0) {
      lines.push(`• …y ${ocultas} más. Míralas todas en el admin.`);
    }
    // El total SÍ suma todas: es la plata que hay que sacar, no una muestra.
    const total = open.reduce((acc, s) => acc + (s.estTotal === null ? 0 : Number(s.estTotal)), 0);
    const message = buildOwnerAlert({
      businessName: businessName(),
      title: 'Compras pendientes de gestionar',
      body: [
        ...lines,
        '',
        `Total estimado: $${Math.round(total).toLocaleString('es-CO')}`,
        `(${open.length} ${open.length === 1 ? 'sugerencia abierta' : 'sugerencias abiertas'})`,
      ].join('\n'),
    });

    const recipients: WhatsAppSendOutcome['recipients'] = [];
    let sent = 0;
    let failed = 0;

    // Sin proveedor real (el mock de dev) NO se finge el envío: antes decía
    // "Enviado a 2 destinatarios" y no salía ni un mensaje (§7.v22).
    if (this.whatsapp.delivers === false) {
      this.logger.log(
        'Sin proveedor de WhatsApp: el resumen de compras NO se envió.',
      );
      await this.audit.log({
        userId: actorId,
        action: 'PURCHASE_SUGGESTION_SUMMARY_SENT',
        entityType: 'purchase_suggestion',
        metadata: {
          suggestions: open.length,
          sent: 0,
          failed: 0,
          delivered: false,
          error: 'sin proveedor de WhatsApp',
        },
      });
      return {
        sent: 0,
        failed: 0,
        recipients: admins.map((a) => ({
          name: a.fullName,
          phone: a.phone ?? '—',
          status: 'skipped' as const,
          reason: 'no hay WhatsApp conectado en el servidor',
        })),
        preview: message,
      };
    }

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

/** El instante N horas antes de `from`. */
function hoursAgo(from: Date, hours: number): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

/** Fecha de emisión de la orden, legible en español. */
function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Día de entrega legible para el proveedor: "mañana, martes 28 de julio".
 * El "hoy/mañana" se mide en hora LOCAL del server (prod: America/Bogota),
 * igual que el resto de las fechas elegidas por el usuario.
 */
function formatNeededByLabel(ymd: string): string {
  const target = localMidnightOfYmd(ymd);
  const today = localMidnightOfYmd(ymdLocal(new Date()));
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  const pretty = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(target);

  if (days === 0) return `hoy, ${pretty}`;
  if (days === 1) return `mañana, ${pretty}`;
  return pretty;
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
    // Las sugerencias creadas antes de guardar la unidad de stock caen a la de
    // compra con factor 1: es lo único honesto que se puede decir de ellas.
    unitStock: row.unitStock ?? row.unitPurchase,
    conversionFactor:
      row.conversionFactor === null ? 1 : Number(row.conversionFactor),
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
