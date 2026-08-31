import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  renderComandaEscPos,
  renderReceiptEscPos,
  type ComandaData,
  type ReceiptData,
} from '@pos-tercos/domain';
import type { CortesiaPrintDocs } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { businessInfo } from '../common/business-info';
import { PrismaService } from '../prisma/prisma.service';

/** Tope de líneas por impresión: es un pedido de mostrador, no un inventario. */
const MAX_LINEAS = 50;

/**
 * Los dos papeles de un pedido REGALADO.
 *
 * Una cortesía no era una venta y por eso no imprimía nada: la cocina no se
 * enteraba de qué preparar y el cliente se iba sin comprobante de lo que
 * recibió. Son los mismos dos papeles de una venta normal, con dos diferencias
 * que importan:
 *
 *  - No lleva número de recibo. La numeración es contable y no puede tener
 *    regalos adentro; el papel se identifica por fecha, hora y cajero.
 *  - El recibo declara el valor regalado y cobra $0. Esconder el valor haría
 *    ver la cortesía como gratis, y no lo es: ese costo baja el resultado del
 *    mes (§7.v32).
 *
 * El grupo de líneas lo define QUIEN IMPRIME pasando los ids que acaba de
 * crear: la caja registra una fila por línea del carrito y son esas las que
 * forman el pedido. Así no hace falta una columna de lote en la base.
 */
@Injectable()
export class CortesiaPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async buildDocs(ids: string[], userId: string): Promise<CortesiaPrintDocs> {
    if (ids.length === 0 || ids.length > MAX_LINEAS) {
      throw new BadRequestException('Selecciona entre 1 y 50 líneas para imprimir.');
    }

    const pedido = await this.loadPedido(ids);
    const receipt = buildReceipt(pedido);
    const paraCocina = pedido.lineas.filter((l) => l.seCocina);

    await this.audit.log({
      userId,
      action: 'CORTESIA_PRINTED',
      entityType: 'cortesia_request',
      entityId: pedido.primerId,
      metadata: {
        lineas: pedido.lineas.length,
        valorRegalado: pedido.valorRegalado,
        aCocina: paraCocina.length,
      },
    });

    return {
      receiptBase64: renderReceiptEscPos(receipt).toString('base64'),
      comandaBase64:
        paraCocina.length > 0
          ? renderComandaEscPos(buildComanda(pedido, paraCocina)).toString('base64')
          : null,
      kitchenItemCount: paraCocina.length,
      valorRegalado: pedido.valorRegalado,
    };
  }

  /**
   * Junta las líneas del pedido con los nombres que hay que imprimir.
   *
   * `cortesia_requests` guarda los ids sueltos (sin relación Prisma), así que
   * los nombres se resuelven en dos consultas y no en una por línea.
   */
  private async loadPedido(ids: string[]): Promise<PedidoRegalado> {
    const rows = await this.prisma.cortesiaRequest.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length !== ids.length) {
      throw new NotFoundException('Alguna de las cortesías del pedido ya no existe.');
    }

    const [products, sizes, cajero] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.productId))] } },
        select: { id: true, name: true, directResale: true },
      }),
      this.prisma.productSize.findMany({
        where: { id: { in: rows.map((r) => r.sizeId).filter((x): x is string => x !== null) } },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: rows[0].requestedById },
        select: { fullName: true },
      }),
    ]);
    const productoPorId = new Map(products.map((p) => [p.id, p]));
    const tallePorId = new Map(sizes.map((z) => [z.id, z.name]));

    return {
      primerId: rows[0].id,
      createdAt: rows[0].createdAt.toISOString(),
      cashierName: cajero?.fullName ?? null,
      // El motivo es el mismo para todo el pedido (la caja lo pide una vez); si
      // llegaran distintos se muestran todos, nunca uno elegido al azar.
      motivo: [...new Set(rows.map((r) => r.reason.trim()))].join(' · '),
      valorRegalado: rows.reduce((sum, r) => sum + Number(r.salePrice), 0),
      lineas: rows.map((r) => ({
        productName: productoPorId.get(r.productId)?.name ?? 'Producto',
        sizeName: r.sizeId ? (tallePorId.get(r.sizeId) ?? null) : null,
        quantity: r.quantity,
        salePrice: Number(r.salePrice),
        seCocina: productoPorId.get(r.productId)?.directResale === false,
      })),
    };
  }
}

interface LineaRegalada {
  productName: string;
  sizeName: string | null;
  quantity: number;
  salePrice: number;
  /** false = reventa directa (una bebida): se entrega en el mostrador. */
  seCocina: boolean;
}

interface PedidoRegalado {
  primerId: string;
  createdAt: string;
  cashierName: string | null;
  motivo: string;
  valorRegalado: number;
  lineas: LineaRegalada[];
}

function buildReceipt(p: PedidoRegalado): ReceiptData {
  return {
    receiptNumber: null,
    createdAt: p.createdAt,
    cashierName: p.cashierName,
    customerName: null,
    items: p.lineas.map((l) => ({
      productName: l.productName,
      sizeName: l.sizeName,
      quantity: l.quantity,
      unitPrice: l.salePrice / l.quantity,
      lineSubtotal: l.salePrice,
      lineDiscount: 0,
      lineTotal: l.salePrice,
      appliedPromotionName: null,
      modifiers: [],
    })),
    subtotal: p.valorRegalado,
    discountTotal: 0,
    total: p.valorRegalado,
    reprintLabel: null,
    // Nada que cobrar: no hay por qué abrir el cajón.
    openDrawer: false,
    cortesia: { motivo: p.motivo, valorRegalado: p.valorRegalado },
    business: businessInfo(),
  };
}

/**
 * A la cocina solo va lo que se prepara: una gaseosa regalada se entrega en el
 * mostrador, y una comanda con una sola bebida hace que la cocina deje de
 * creerle al papel.
 */
function buildComanda(p: PedidoRegalado, lineas: LineaRegalada[]): ComandaData {
  return {
    receiptNumber: null,
    createdAt: p.createdAt,
    type: 'COUNTER',
    customerName: null,
    items: lineas.map((l) => ({
      productName: l.productName,
      sizeName: l.sizeName,
      quantity: l.quantity,
      modifiers: [],
      notes: null,
    })),
    reprintLabel: null,
    title: 'CORTESÍA',
    footer: businessInfo().name,
  };
}
