import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildNoSaleDrawerAlertMessage,
  renderReceiptEscPos,
  type CashDrawerProvider,
  type DrawerOpenResult,
  type PrinterProvider,
  type PrintResult,
} from '@pos-tercos/domain';
import { CASH_DRAWER_PROVIDER } from '../adapters/cash-drawer/cash-drawer.module';
import { PRINTER_PROVIDER } from '../adapters/printer/printer.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildReceiptData, includeFull, toSaleDto } from './sales.mappers';

const PRINTABLE_STATUSES = ['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ENTREGADO'] as const;

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
