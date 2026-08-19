import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildNoSaleDrawerAlertMessage,
  renderComandaEscPos,
  renderReceiptEscPos,
  type CashDrawerProvider,
  type ComandaData,
  type DrawerOpenResult,
  type PrinterProvider,
  type PrintResult,
} from '@pos-tercos/domain';
import { saleStatusLabel } from '@pos-tercos/types';
import type { AppliedModifier, SendToKitchenResponse } from '@pos-tercos/types';
import { CASH_DRAWER_PROVIDER } from '../adapters/cash-drawer/cash-drawer.module';
import { PRINTER_PROVIDER } from '../adapters/printer/printer.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { runWithSerializationRetry } from '../common/tx';
import { buildComandaData, buildReceiptData, includeFull, toSaleDto } from './sales.mappers';

const PRINTABLE_STATUSES = ['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO'] as const;

/** La comanda sale al COBRAR (venta recién creada) o después si se repite. */
const COMANDA_STATUSES = ['PENDIENTE_PAGO', ...PRINTABLE_STATUSES] as const;

/**
 * Recibos y cajón monedero. Separado de SalesService: no toca el ciclo de
 * vida de la venta, solo la imprime/reimprime y abre el cajón (con o sin
 * venta, esto último con PIN de aprobación).
 */
@Injectable()
export class SalesReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(PRINTER_PROVIDER) private readonly printer: PrinterProvider,
    @Inject(CASH_DRAWER_PROVIDER) private readonly drawer: CashDrawerProvider,
    private readonly ownerNotifications: OwnerNotificationService,
  ) {}

  /**
   * Devuelve el recibo renderizado a bytes ESC/POS (base64) para que el
   * NAVEGADOR del mostrador lo mande al print-agent LOCAL (impresión sin que
   * el backend tenga que alcanzar la impresora). Audita igual que printReceipt.
   */
  async getReceiptEscPos(
    saleId: string,
    userId: string,
  ): Promise<{ escposBase64: string; receiptNumber: number; reprint: boolean }> {
    const sale = await this.loadPrintableSale(saleId);
    const previousPrints = await this.countPreviousPrints(saleId);
    const isReprint = previousPrints > 0;
    const receipt = buildReceiptData(toSaleDto(sale), isReprint);
    const bytes = renderReceiptEscPos(receipt);

    await this.audit.log({
      userId,
      action: isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        receiptNumber: Number(sale.receiptNumber),
        via: 'browser-agent',
        previousPrintCount: previousPrints,
      },
    });

    return {
      escposBase64: bytes.toString('base64'),
      receiptNumber: Number(sale.receiptNumber),
      reprint: isReprint,
    };
  }

  /**
   * Comanda de COCINA en bytes ESC/POS (base64) para el print-agent local.
   * Se permite desde PENDIENTE_PAGO: la comanda sale al COBRAR, antes de
   * confirmar el pago, para que cocina arranque ya.
   */
  async getComandaEscPos(
    saleId: string,
    userId: string,
    cancel = false,
    variant: 'kitchen' | 'full' = 'full',
    corrected = false,
  ): Promise<{
    escposBase64: string;
    receiptNumber: number;
    reprint: boolean;
    itemCount: number;
  }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: includeFull(),
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (!COMANDA_STATUSES.includes(sale.status as (typeof COMANDA_STATUSES)[number])) {
      throw new BadRequestException(
        `Un pedido en estado "${saleStatusLabel(sale.status)}" no genera comanda.`,
      );
    }
    // Comanda de cocina: si el pedido tiene AL MENOS un plato (algo que se
    // prepara, no reventa directa), imprime el pedido COMPLETO — incluidas las
    // bebidas — para armar la orden entera. Si es SOLO bebidas, queda vacía
    // (itemCount 0 → el POS no imprime comanda en cocina). La comanda completa
    // (cajero) siempre lleva todo.
    const hasKitchenItem = sale.items.some((it) => !it.product?.directResale);
    const scoped =
      variant === 'kitchen'
        ? { ...sale, items: hasKitchenItem ? sale.items : [] }
        : sale;

    const previousPrints = await this.prisma.auditLog.count({
      where: { action: 'COMANDA_PRINTED', entityType: 'sale', entityId: saleId },
    });
    const isReprint = !cancel && previousPrints > 0;
    const comanda = {
      ...buildComandaData(toSaleDto(scoped), isReprint),
      cancelled: cancel,
      title: variant === 'kitchen' ? 'COMANDA COCINA' : 'COMANDA COMPLETA',
      // Edición de un pedido → la comanda reemplaza la anterior; rótulo claro
      // para que cocina no la confunda con el pedido original.
      reprintLabel: corrected
        ? 'PEDIDO MODIFICADO'
        : isReprint
          ? 'REIMPRESIÓN'
          : null,
    };
    const bytes = renderComandaEscPos(comanda);

    await this.audit.log({
      userId,
      action: cancel ? 'COMANDA_CANCELLED' : 'COMANDA_PRINTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        receiptNumber: Number(sale.receiptNumber),
        reprint: isReprint,
        variant,
      },
    });

    return {
      escposBase64: bytes.toString('base64'),
      receiptNumber: Number(sale.receiptNumber),
      reprint: isReprint,
      itemCount: scoped.items.length,
    };
  }

  /**
   * Cuentas abiertas (#3): envía a cocina SOLO lo pendiente (comanda
   * incremental). Estampa `sentToKitchenQty = quantity` en las líneas enviadas
   * y devuelve las dos variantes de comanda (cocina / completa) con únicamente
   * las unidades NUEVAS, para que el POS las rutee a sus impresoras.
   * Si no hay nada pendiente, no estampa ni renderiza (pendingCount=0).
   */
  async sendToKitchen(saleId: string, userId: string): Promise<SendToKitchenResponse> {
    // Dos envíos CONCURRENTES no pueden imprimir la misma tanda dos veces
    // (cocina prepararía doble): el estampado va con guard optimista por fila
    // (updateMany condicionado al sentToKitchenQty leído) — si otro envío ganó
    // la carrera, count===0 → se aborta y el reintento recomputa lo pendiente
    // (que ya estará vacío → pendingCount 0, sin comanda).
    const result = await runWithSerializationRetry(() =>
     this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: includeFull() });
      if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
      if (!COMANDA_STATUSES.includes(sale.status as (typeof COMANDA_STATUSES)[number])) {
        throw new BadRequestException(`Un pedido en estado "${saleStatusLabel(sale.status)}" no genera comanda.`);
      }

      const pending = sale.items.filter((it) => it.quantity > it.sentToKitchenQty);
      const receiptNumber = Number(sale.receiptNumber);
      const prevBatches = new Set(
        sale.items
          .filter((it) => it.sentToKitchenAt !== null)
          .map((it) => it.sentToKitchenAt!.getTime()),
      ).size;
      if (pending.length === 0) {
        return {
          batch: Math.max(prevBatches, 1),
          pendingCount: 0,
          kitchen: null,
          full: null,
          receiptNumber,
        } satisfies SendToKitchenResponse;
      }

      const now = new Date();
      for (const it of pending) {
        const claim = await tx.saleItem.updateMany({
          where: { id: it.id, sentToKitchenQty: it.sentToKitchenQty },
          data: { sentToKitchenQty: it.quantity, sentToKitchenAt: now },
        });
        if (claim.count === 0) {
          // Otro envío (u otra edición) tocó la línea entre la lectura y acá.
          // P2034 sintético → runWithSerializationRetry reintenta con datos frescos.
          throw Object.assign(new Error('could not serialize send-to-kitchen claim'), {
            code: 'P2034',
          });
        }
      }

      const batch = prevBatches + 1;
      const pendingLines = pending.map((it) => ({
        productName: it.product?.name ?? '(sin nombre)',
        sizeName: it.size?.name ?? null,
        quantity: it.quantity - it.sentToKitchenQty,
        modifiers: (((it.modifiersJson as unknown as AppliedModifier[]) ?? []) as AppliedModifier[]).map(
          (m) => m.name,
        ),
        notes: it.notes ?? null,
        directResale: it.product?.directResale ?? false,
      }));
      // Misma regla que la comanda normal: si la tanda tiene al menos un plato,
      // la comanda de cocina lleva TODO lo pendiente (incl. bebidas); si es solo
      // reventa, queda vacía y el POS no la imprime en cocina.
      const hasKitchenItem = pendingLines.some((l) => !l.directResale);
      const base = (lines: typeof pendingLines, title: string): ComandaData => ({
        receiptNumber,
        createdAt: now.toISOString(),
        type: sale.type,
        customerName: sale.customerName,
        deliveryAddress: sale.deliveryAddress ?? null,
        deliveryNotes: sale.deliveryNotes ?? null,
        customerPhone: sale.customerPhone,
        items: lines.map(({ directResale: _drop, ...line }) => line),
        title,
        // Tanda 2+ → rótulo ADICIÓN: cocina sabe que se SUMA al pedido anterior.
        reprintLabel: batch > 1 ? 'ADICIÓN' : null,
        footer: process.env.BUSINESS_NAME ?? 'Tercos',
      });
      const kitchenLines = hasKitchenItem ? pendingLines : [];
      const kitchen = base(kitchenLines, 'COMANDA COCINA');
      const full = base(pendingLines, 'COMANDA COMPLETA');

      return {
        batch,
        pendingCount: pendingLines.length,
        kitchen: {
          escposBase64: renderComandaEscPos(kitchen).toString('base64'),
          itemCount: kitchenLines.length,
        },
        full: {
          escposBase64: renderComandaEscPos(full).toString('base64'),
          itemCount: pendingLines.length,
        },
        receiptNumber,
      } satisfies SendToKitchenResponse;
     }),
    );

    if (result.pendingCount > 0) {
      await this.audit.log({
        userId,
        action: 'SALE_SENT_TO_KITCHEN',
        entityType: 'sale',
        entityId: saleId,
        metadata: {
          receiptNumber: result.receiptNumber,
          batch: result.batch,
          lines: result.pendingCount,
        },
      });
    }
    return result;
  }

  /**
   * Imprime/reimprime el recibo de la sale vía PrinterProvider del backend.
   * La 1ra vez audita RECEIPT_PRINTED; las siguientes RECEIPT_REPRINTED y el
   * render lleva banner "DUPLICADO" (no pisa el original).
   */
  async printReceipt(saleId: string, userId: string): Promise<PrintResult> {
    const sale = await this.loadPrintableSale(saleId);
    const previousPrints = await this.countPreviousPrints(saleId);
    const isReprint = previousPrints > 0;

    const receipt = buildReceiptData(toSaleDto(sale), isReprint);
    const result = await this.printer.print(receipt);

    await this.audit.log({
      userId,
      action: isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINTED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        receiptNumber: Number(sale.receiptNumber),
        printerKey: result.key,
        previousPrintCount: previousPrints,
      },
    });

    return result;
  }

  /**
   * Abre el cajón monedero. Dos modos:
   *  - Con sale (saleId presente): apertura normal post-pago. Sin PIN.
   *  - Sin sale ("no-sale"): requiere reason + X-Approval-Pin (cajero NO
   *    puede abrir cajón sin venta sin aprobación, pos-spec.v1.md:58).
   */
  async openDrawer(input: {
    saleId: string | null;
    reason: string | null;
    cashierId: string;
    approverPin?: string;
  }): Promise<DrawerOpenResult> {
    const isNoSale = input.saleId === null;

    if (isNoSale) {
      if (!input.reason || input.reason.trim().length < 5) {
        throw new BadRequestException(
          'Apertura sin venta requiere reason (mínimo 5 caracteres).',
        );
      }
      if (!input.approverPin) {
        throw new ForbiddenException(
          'Apertura sin venta requiere X-Approval-Pin de Admin/Dueño.',
        );
      }
      const approverId = await this.approvals.verify(input.approverPin).catch(
        async (err) => {
          await this.audit.log({
            userId: input.cashierId,
            action: 'APPROVAL_DENIED',
            entityType: 'cash_drawer',
            metadata: {
              reason: 'open-no-sale',
              given: input.reason,
              message: err instanceof Error ? err.message : 'invalid pin',
            },
          });
          throw err instanceof ForbiddenException
            ? err
            : new ForbiddenException('PIN inválido');
        },
      );

      const result = await this.drawer.open({ reason: input.reason });

      await this.audit.log({
        userId: input.cashierId,
        action: 'CASH_DRAWER_OPENED_NO_SALE',
        entityType: 'cash_drawer',
        metadata: { reason: input.reason, approverId },
      });
      await this.audit.log({
        userId: approverId,
        action: 'APPROVAL_GRANTED',
        entityType: 'cash_drawer',
        metadata: { context: 'open-no-sale', cashierId: input.cashierId },
      });

      // Antifraude: abrir el cajón sin venta siempre le llega al dueño.
      const cashier = await this.prisma.user.findUnique({
        where: { id: input.cashierId },
        select: { fullName: true },
      });
      void this.ownerNotifications.alert(
        'drawer_no_sale',
        buildNoSaleDrawerAlertMessage({
          businessName: process.env.BUSINESS_NAME ?? 'Tercos',
          cashierName: cashier?.fullName ?? null,
          reason: input.reason,
        }),
        { cashierId: input.cashierId },
      );

      return result;
    }

    // Apertura normal: validar que la sale exista + esté pagada
    const sale = await this.prisma.sale.findUnique({
      where: { id: input.saleId! },
      select: { id: true, status: true, receiptNumber: true },
    });
    if (!sale) throw new NotFoundException(`Sale ${input.saleId} not found`);
    if (sale.status !== 'PAGADO') {
      throw new BadRequestException(
        `Sale en status ${sale.status} no permite apertura de cajón (solo PAGADO).`,
      );
    }

    const result = await this.drawer.open({ reason: null });

    await this.audit.log({
      userId: input.cashierId,
      action: 'CASH_DRAWER_OPENED',
      entityType: 'sale',
      entityId: sale.id,
      metadata: { receiptNumber: Number(sale.receiptNumber) },
    });

    return result;
  }

  /** Solo desde PAGADO en adelante tiene sentido un recibo. */
  private async loadPrintableSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: includeFull(),
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (!PRINTABLE_STATUSES.includes(sale.status as (typeof PRINTABLE_STATUSES)[number])) {
      throw new BadRequestException(
        `Sale en status ${sale.status} no se puede imprimir (solo desde PAGADO en adelante).`,
      );
    }
    return sale;
  }

  private async countPreviousPrints(saleId: string): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        action: { in: ['RECEIPT_PRINTED', 'RECEIPT_REPRINTED'] },
        entityType: 'sale',
        entityId: saleId,
      },
    });
  }
}
