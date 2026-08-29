import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Invoice,
  UserRole,
  VoidInvoice,
  VoidInvoicePreview,
  VoidInvoicePreviewLine,
} from '@pos-tercos/types';
import { Prisma } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { runWithSerializationRetry } from '../common/tx';
import { PrismaService } from '../prisma/prisma.service';
import { includeFull, toInvoiceDto } from './invoices.mappers';
import { recomputeCostsAfterVoid } from './recompute-costs';

/** Movimiento de inventario que creó la factura, con lo justo para deshacerlo. */
interface MovimientoDeCompra {
  id: string;
  createdAt: Date;
  delta: Prisma.Decimal;
  entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
  ingredientId: string | null;
  productId: string | null;
}

/** Días desde que se confirmó en los que la factura todavía se puede anular. */
export const VOID_WINDOW_DAYS = 3;

/** `sourceType` del movimiento que deshace la entrada de una compra. */
export const INVOICE_REVERSAL_SOURCE_TYPE = 'invoice_reversal';

/**
 * Anular una factura CONFIRMADA.
 *
 * Deshace la entrada de mercancía escribiendo un movimiento compensatorio por
 * cada uno de los que creó la factura, CON LA FECHA del original. Esa fecha es
 * lo que hace exacta la operación: en el replay del motor de costos la reversa
 * llega pegada a su lote —antes de que nadie lo consumiera— así que todo lo
 * posterior se recalcula como si la factura nunca hubiera existido. Las ventas
 * que ya se habían comido esa mercancía pasan a ser faltantes estimados, con su
 * deuda, que la factura corregida salda al costo real.
 *
 * `inventory_movements` es insert-only: nada se borra ni se edita. La factura
 * tampoco se borra — el documento existió y movió plata, así que queda con
 * sello de anulada, su motivo y su autor.
 */
@Injectable()
export class InvoiceVoidService {
  private readonly logger = new Logger(InvoiceVoidService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
  ) {}

  /** Qué le va a pasar al inventario. Se consulta antes de anular. */
  async preview(id: string): Promise<VoidInvoicePreview> {
    const factura = await this.cargarParaAnular(id);
    const bloqueo = motivoQueImpideAnular(factura);
    if (bloqueo) {
      return { blockedReason: bloqueo, daysLeft: diasQueQuedan(factura.confirmedAt), lines: [], goesNegative: [] };
    }

    const movimientos = await this.movimientosDeLaFactura(id);
    const lines: VoidInvoicePreviewLine[] = [];
    for (const m of movimientos) {
      const entityType = m.entityType === 'PRODUCT' ? 'PRODUCT' : 'INGREDIENT';
      const entityId = (entityType === 'INGREDIENT' ? m.ingredientId : m.productId) as string;
      const [existencias, ficha] = await Promise.all([
        this.existenciasDe(entityType, entityId),
        this.fichaDe(entityType, entityId),
      ]);
      const delta = -Number(m.delta);
      lines.push({
        entityType,
        entityId,
        name: ficha.name,
        unit: ficha.unit,
        currentStock: existencias,
        delta,
        resultingStock: redondear(existencias + delta),
      });
    }

    return {
      blockedReason: null,
      daysLeft: diasQueQuedan(factura.confirmedAt),
      lines,
      // Lo que la caja va a frenar: sin stock, el cobro de un producto que use
      // ese insumo se rechaza. Es la consecuencia que más se siente en el local.
      goesNegative: lines.filter((l) => l.resultingStock < 0).map((l) => l.name),
    };
  }

  async void(
    id: string,
    input: VoidInvoice,
    pin: string,
    actorId: string,
    actorRole: UserRole,
  ): Promise<Invoice> {
    if (actorRole !== 'DUENO') {
      throw new BadRequestException('Solo el dueño puede anular una factura confirmada.');
    }
    const factura = await this.cargarParaAnular(id);
    const bloqueo = motivoQueImpideAnular(factura);
    if (bloqueo) throw new BadRequestException(bloqueo);
    const approverId = await this.approvals.verify(pin);

    const movimientos = await this.movimientosDeLaFactura(id);
    if (movimientos.length === 0) {
      throw new BadRequestException(
        'Esta factura no tiene movimientos de inventario que deshacer. Repórtalo antes de seguir.',
      );
    }
    const masAntiguo = movimientos.reduce(
      (min, m) => (m.createdAt < min ? m.createdAt : min),
      movimientos[0]!.createdAt,
    );

    await runWithSerializationRetry(() =>
      this.prisma.$transaction(
        (tx) => this.escribirAnulacion(tx, { id, actorId, reason: input.reason, movimientos, masAntiguo }),
        { isolationLevel: 'Serializable' },
      ),
    );

    await this.despuesDeAnular({
      id,
      actorId,
      approverId,
      reason: input.reason,
      movimientos,
      totalAnterior: factura.total !== null ? Number(factura.total) : null,
      confirmedAt: factura.confirmedAt,
    });

    const row = await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: includeFull() });
    return toInvoiceDto(row);
  }

  /**
   * Lo que va DESPUÉS de la transacción: recalcular los costos denormalizados y
   * dejar el rastro. Si el recálculo fallara, el inventario y el P&G ya
   * quedaron bien — solo el "último precio" mostraría un valor viejo hasta la
   * próxima compra, así que no vale la pena revertir la anulación por eso.
   */
  private async despuesDeAnular(datos: {
    id: string;
    actorId: string;
    approverId: string;
    reason: string;
    movimientos: MovimientoDeCompra[];
    totalAnterior: number | null;
    confirmedAt: Date | null;
  }): Promise<void> {
    try {
      await recomputeCostsAfterVoid(this.prisma, datos.movimientos);
    } catch (err) {
      this.logger.error(
        `Factura ${datos.id} anulada, pero falló recalcular el último costo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.audit.log({
      userId: datos.actorId,
      action: 'INVOICE_VOIDED',
      entityType: 'invoice',
      entityId: datos.id,
      before: { status: 'CONFIRMED', total: datos.totalAnterior },
      after: { status: 'VOIDED' },
      metadata: {
        approverId: datos.approverId,
        reason: datos.reason,
        movementsReversed: datos.movimientos.length,
        confirmedAt: datos.confirmedAt?.toISOString() ?? null,
      },
    });
  }

  /** El corazón de la anulación, dentro de la transacción. */
  private async escribirAnulacion(
    tx: Prisma.TransactionClient,
    datos: {
      id: string;
      actorId: string;
      reason: string;
      movimientos: MovimientoDeCompra[];
      masAntiguo: Date;
    },
  ): Promise<void> {
    // Claim condicionado: dos anulaciones a la vez (doble clic, dos pestañas)
    // no pueden escribir dos juegos de compensatorios.
    const claim = await tx.invoice.updateMany({
      where: { id: datos.id, status: 'CONFIRMED' },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: datos.actorId,
        voidReason: datos.reason,
        // El estado de pago vuelve a "no aplica": una factura anulada no es una
        // cuenta por pagar. Lo exige el CHECK
        // `chk_invoice_payment_only_when_confirmed` de la base, y de paso hace
        // imposible por construcción que una anulada se cuele en la suma de
        // pagos de Tesorería, que filtra solo por payment_status.
        paymentStatus: null,
        paidAt: null,
        paymentActorId: null,
        paymentCashAmount: 0,
        paymentBankAmount: 0,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Esta factura ya no está confirmada. Vuelve a abrirla.');
    }

    await tx.inventoryMovement.createMany({
      data: datos.movimientos.map((m) => ({
        entityType: m.entityType,
        ingredientId: m.ingredientId,
        productId: m.productId,
        delta: new Prisma.Decimal(0).minus(m.delta),
        // El costo del lote lo resuelve el motor: la reversa apunta al
        // movimiento original y le quita SUS unidades, no las más viejas.
        unitCost: null,
        type: 'PURCHASE',
        sourceType: INVOICE_REVERSAL_SOURCE_TYPE,
        sourceId: m.id,
        userId: datos.actorId,
        notes: `Anulación de factura · ${datos.reason}`,
        // Misma fecha que el original: es lo que hace que el replay lo recalcule
        // todo como si la compra nunca hubiera entrado.
        createdAt: m.createdAt,
        // Un reintento de la transacción no puede duplicar la devolución.
        idempotencyKey: `invoice-void:${m.id}`,
      })),
      skipDuplicates: true,
    });

    // Los cortes mensuales del motor resumen "todo lo anterior a esta fecha".
    // Como la reversa nace con fecha vieja, cualquier corte posterior quedó
    // calculado sin ella: se borran y el replay vuelve a ser completo (correcto
    // siempre, apenas más lento) hasta que el cron los reconstruya.
    await tx.ledgerSnapshot.deleteMany({ where: { cutoffAt: { gt: datos.masAntiguo } } });
  }

  private async cargarParaAnular(id: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, confirmedAt: true, paymentStatus: true, total: true },
    });
    if (!row) throw new NotFoundException('Esa factura no existe.');
    return row;
  }

  private movimientosDeLaFactura(id: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { sourceType: 'invoice', sourceId: id },
      select: {
        id: true,
        createdAt: true,
        delta: true,
        entityType: true,
        ingredientId: true,
        productId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async existenciasDe(entityType: 'INGREDIENT' | 'PRODUCT', entityId: string): Promise<number> {
    const agg = await this.prisma.inventoryMovement.aggregate({
      where:
        entityType === 'INGREDIENT'
          ? { entityType: 'INGREDIENT', ingredientId: entityId }
          : { entityType: 'PRODUCT', productId: entityId },
      _sum: { delta: true },
    });
    return redondear(Number(agg._sum.delta ?? 0));
  }

  private async fichaDe(
    entityType: 'INGREDIENT' | 'PRODUCT',
    entityId: string,
  ): Promise<{ name: string; unit: string }> {
    if (entityType === 'INGREDIENT') {
      const ing = await this.prisma.ingredient.findUnique({
        where: { id: entityId },
        select: { name: true, unitRecipe: true },
      });
      return { name: ing?.name ?? 'Insumo eliminado', unit: ing?.unitRecipe ?? 'unidad' };
    }
    const prod = await this.prisma.product.findUnique({
      where: { id: entityId },
      select: { name: true, unitStock: true },
    });
    return { name: prod?.name ?? 'Producto eliminado', unit: prod?.unitStock ?? 'unidad' };
  }
}

/** Por qué NO se puede anular, en palabras. `null` = se puede. */
function motivoQueImpideAnular(factura: {
  status: string;
  confirmedAt: Date | null;
  paymentStatus: string | null;
}): string | null {
  if (factura.status === 'VOIDED') return 'Esta factura ya está anulada.';
  if (factura.status !== 'CONFIRMED') {
    return 'Solo se anulan facturas confirmadas. Un borrador se borra y una rechazada ya no cuenta.';
  }
  if (factura.paymentStatus === 'PAID') {
    // Deshacer el pago es un camino aparte, con su PIN y su bolsillo: obligarlo
    // primero evita que la anulación tenga que adivinar a dónde vuelve la plata.
    return 'Esta factura está pagada. Primero deshaz el pago (así eliges a qué bolsillo vuelve la plata) y después anúlala.';
  }
  if (diasQueQuedan(factura.confirmedAt) <= 0) {
    return `Pasaron más de ${VOID_WINDOW_DAYS} días desde que se confirmó: ya no se puede anular. Corrige el inventario con un ajuste manual.`;
  }
  return null;
}

/** Días que faltan para que se cierre la ventana. 0 o menos = vencida. */
function diasQueQuedan(confirmedAt: Date | null): number {
  if (!confirmedAt) return 0;
  const transcurridos = (Date.now() - confirmedAt.getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(VOID_WINDOW_DAYS - transcurridos));
}

/** Las cantidades de inventario se guardan con 4 decimales. */
function redondear(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
