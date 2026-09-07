import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PRODUCTION_REVERSAL_SOURCE_TYPE } from '@pos-tercos/domain';
import type { VoidProduction, VoidProductionPreview, VoidProductionPreviewLine } from '@pos-tercos/types';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { runWithSerializationRetry } from '../common/tx';
import { PrismaService } from '../prisma/prisma.service';

/** Movimiento que escribió la tanda, con lo justo para deshacerlo. */
interface MovimientoDeTanda {
  id: string;
  createdAt: Date;
  delta: Prisma.Decimal;
  entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
  ingredientId: string | null;
  productId: string | null;
  subproductId: string | null;
}

/** Días desde que se registró en los que la tanda todavía se puede anular. */
export const PRODUCTION_VOID_WINDOW_DAYS = 3;

/**
 * Anular una TANDA DE PRODUCCIÓN mal registrada.
 *
 * Deshace las dos mitades de la tanda escribiendo un movimiento compensatorio
 * por cada uno de los que escribió, CON LA FECHA del original. Esa fecha es lo
 * que hace exacta la operación: en el replay del motor de costos la anulación
 * llega pegada a su tanda —antes de que nadie hubiera vendido el subproducto—
 * así que los insumos vuelven a SU lote, con su costo, y todo lo posterior se
 * recalcula como si la tanda nunca hubiera existido.
 *
 * Si el subproducto ya se vendió, esas ventas pasan a ser faltantes estimados
 * con su deuda, y el subproducto queda en NEGATIVO. Es a propósito: se vendió
 * algo que ahora decimos que no se produjo, y esa contradicción tiene que
 * quedar a la vista (la próxima tanda real salda la deuda).
 *
 * `inventory_movements` es insert-only: nada se borra ni se edita.
 */
@Injectable()
export class ProductionVoidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Qué le va a pasar al inventario. Se consulta antes de anular. */
  async preview(runId: string): Promise<VoidProductionPreview> {
    const movimientos = await this.movimientosDeLaTanda(runId);
    if (movimientos.length === 0) throw new NotFoundException('Esa tanda de producción no existe.');

    const bloqueo = await this.motivoQueImpideAnular(runId, movimientos);
    const daysLeft = diasQueQuedan(this.registradaEl(movimientos));
    if (bloqueo) return { blockedReason: bloqueo, daysLeft, lines: [], goesNegative: [] };

    const lines: VoidProductionPreviewLine[] = [];
    for (const m of movimientos) {
      const ref = referenciaDe(m);
      if (!ref) continue;
      const [existencias, ficha] = await Promise.all([
        this.existenciasDe(ref.entityType, ref.entityId),
        this.fichaDe(ref.entityType, ref.entityId),
      ]);
      const delta = -Number(m.delta);
      lines.push({
        entityType: ref.entityType,
        entityId: ref.entityId,
        name: ficha.name,
        unit: ficha.unit,
        currentStock: existencias,
        delta,
        resultingStock: redondear(existencias + delta),
      });
    }

    return {
      blockedReason: null,
      daysLeft,
      lines,
      // Lo que la caja va a frenar: sin stock, el cobro de un producto que use
      // ese ítem se rechaza. Es la consecuencia que más se siente en el local.
      goesNegative: lines.filter((l) => l.resultingStock < 0).map((l) => l.name),
    };
  }

  async void(runId: string, input: VoidProduction, actorId: string): Promise<void> {
    const movimientos = await this.movimientosDeLaTanda(runId);
    if (movimientos.length === 0) throw new NotFoundException('Esa tanda de producción no existe.');

    const bloqueo = await this.motivoQueImpideAnular(runId, movimientos);
    if (bloqueo) throw new BadRequestException(bloqueo);

    const registradaEl = this.registradaEl(movimientos);
    await runWithSerializationRetry(() =>
      this.prisma.$transaction(
        (tx) => this.escribirAnulacion(tx, { runId, actorId, input, movimientos, registradaEl }),
        { isolationLevel: 'Serializable' },
      ),
    );
    await this.dejarRastro({ runId, actorId, input, movimientos, registradaEl });
  }

  /** El corazón de la anulación, dentro de la transacción. */
  private async escribirAnulacion(
    tx: Prisma.TransactionClient,
    datos: {
      runId: string;
      actorId: string;
      input: VoidProduction;
      movimientos: MovimientoDeTanda[];
      registradaEl: Date;
    },
  ): Promise<void> {
    // Claim dentro de la transacción: dos anulaciones a la vez (doble clic, dos
    // pestañas) no pueden escribir dos juegos de compensatorios. Con
    // Serializable, Postgres aborta a una y su reintento lee el estado nuevo y
    // la rechaza.
    const yaAnulada = await tx.inventoryMovement.count({
      where: { sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE, sourceId: datos.runId },
    });
    if (yaAnulada > 0) throw new BadRequestException('Esta tanda ya está anulada.');

    await tx.inventoryMovement.createMany({
      data: datos.movimientos.map((m) => ({
        entityType: m.entityType,
        ingredientId: m.ingredientId,
        productId: m.productId,
        subproductId: m.subproductId,
        delta: new Prisma.Decimal(0).minus(m.delta),
        // El costo lo resuelve el motor: los insumos vuelven al lote del que
        // salieron, no entran como mercancía nueva sin costo.
        unitCost: null,
        // PRODUCTION a propósito: así el reporte de uso netea la tanda contra
        // lo producido en vez de contarla como un ajuste.
        type: 'PRODUCTION',
        sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE,
        sourceId: datos.runId,
        userId: datos.actorId,
        notes: `Anulación de tanda · ${datos.input.reason}`.slice(0, 500),
        // Misma fecha que el original: es lo que hace que el replay lo
        // recalcule todo como si la tanda nunca se hubiera registrado.
        createdAt: m.createdAt,
        // Un reintento de la transacción no puede duplicar la devolución.
        idempotencyKey: `production-void:${m.id}`,
      })),
      skipDuplicates: true,
    });

    // Los cortes mensuales del motor resumen "todo lo anterior a esta fecha".
    // Como la anulación nace con fecha vieja, cualquier corte posterior quedó
    // calculado sin ella: se borran y el replay vuelve a ser completo (correcto
    // siempre, apenas más lento) hasta que el cron los reconstruya.
    await tx.ledgerSnapshot.deleteMany({ where: { cutoffAt: { gt: datos.registradaEl } } });
  }

  /** La bitácora, ya fuera de la transacción. */
  private async dejarRastro(datos: {
    runId: string;
    actorId: string;
    input: VoidProduction;
    movimientos: MovimientoDeTanda[];
    registradaEl: Date;
  }): Promise<void> {
    const producido = datos.movimientos.find((m) => Number(m.delta) > 0);
    const subproducto =
      producido?.subproductId ?
        await this.prisma.subproduct.findUnique({
          where: { id: producido.subproductId },
          select: { name: true },
        })
      : null;

    await this.audit.log({
      userId: datos.actorId,
      action: 'SUBPRODUCT_PRODUCTION_VOIDED',
      entityType: 'production_run',
      entityId: datos.runId,
      metadata: {
        reason: datos.input.reason,
        subproductId: producido?.subproductId ?? null,
        subproductName: subproducto?.name ?? null,
        quantityProduced: producido ? Number(producido.delta) : null,
        movementsReversed: datos.movimientos.length,
        producedAt: datos.registradaEl.toISOString(),
      },
    });
  }

  /** Por qué NO se puede anular, en palabras. `null` = se puede. */
  private async motivoQueImpideAnular(
    runId: string,
    movimientos: MovimientoDeTanda[],
  ): Promise<string | null> {
    const yaAnulada = await this.prisma.inventoryMovement.count({
      where: { sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE, sourceId: runId },
    });
    if (yaAnulada > 0) return 'Esta tanda ya está anulada.';
    if (!movimientos.some((m) => Number(m.delta) > 0)) {
      return 'Esta tanda no tiene una entrada de subproducto que deshacer. Repórtalo antes de seguir.';
    }
    if (diasQueQuedan(this.registradaEl(movimientos)) <= 0) {
      return `Pasaron más de ${PRODUCTION_VOID_WINDOW_DAYS} días desde que se registró: ya no se puede anular. Corrige el inventario con un ajuste manual.`;
    }
    return null;
  }

  /** Cuándo se registró la tanda: la fecha de su movimiento más antiguo. */
  private registradaEl(movimientos: MovimientoDeTanda[]): Date {
    return movimientos.reduce(
      (min, m) => (m.createdAt < min ? m.createdAt : min),
      movimientos[0]!.createdAt,
    );
  }

  private movimientosDeLaTanda(runId: string): Promise<MovimientoDeTanda[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { sourceType: 'production', sourceId: runId },
      select: {
        id: true,
        createdAt: true,
        delta: true,
        entityType: true,
        ingredientId: true,
        productId: true,
        subproductId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async existenciasDe(
    entityType: 'INGREDIENT' | 'SUBPRODUCT',
    entityId: string,
  ): Promise<number> {
    const agg = await this.prisma.inventoryMovement.aggregate({
      where:
        entityType === 'INGREDIENT'
          ? { entityType: 'INGREDIENT', ingredientId: entityId }
          : { entityType: 'SUBPRODUCT', subproductId: entityId },
      _sum: { delta: true },
    });
    return redondear(Number(agg._sum.delta ?? 0));
  }

  private async fichaDe(
    entityType: 'INGREDIENT' | 'SUBPRODUCT',
    entityId: string,
  ): Promise<{ name: string; unit: string }> {
    if (entityType === 'INGREDIENT') {
      const ing = await this.prisma.ingredient.findUnique({
        where: { id: entityId },
        select: { name: true, unitRecipe: true },
      });
      return { name: ing?.name ?? 'Insumo eliminado', unit: ing?.unitRecipe ?? 'unidad' };
    }
    const sub = await this.prisma.subproduct.findUnique({
      where: { id: entityId },
      select: { name: true, unit: true },
    });
    return { name: sub?.name ?? 'Subproducto eliminado', unit: sub?.unit ?? 'unidad' };
  }
}

/** A qué ítem apunta el movimiento. Null si la fila está incompleta. */
function referenciaDe(
  m: MovimientoDeTanda,
): { entityType: 'INGREDIENT' | 'SUBPRODUCT'; entityId: string } | null {
  if (m.entityType === 'INGREDIENT' && m.ingredientId) {
    return { entityType: 'INGREDIENT', entityId: m.ingredientId };
  }
  if (m.entityType === 'SUBPRODUCT' && m.subproductId) {
    return { entityType: 'SUBPRODUCT', entityId: m.subproductId };
  }
  return null;
}

/** Días que faltan para que se cierre la ventana. 0 o menos = vencida. */
function diasQueQuedan(registradaEl: Date): number {
  const transcurridos = (Date.now() - registradaEl.getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(PRODUCTION_VOID_WINDOW_DAYS - transcurridos));
}

/** Las cantidades de inventario se guardan con 4 decimales. */
function redondear(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
