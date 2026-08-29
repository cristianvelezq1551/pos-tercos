import { Injectable } from '@nestjs/common';
import { bucketOf, bucketsBetween, type BucketGranularity } from '@pos-tercos/domain';
import type {
  PurchaseFigures,
  PurchasePeriod,
  PurchaseSupplier,
  PurchasesReport,
} from '@pos-tercos/types';
import { ymdLocal } from '../common/local-dates';
import { PrismaService } from '../prisma/prisma.service';

/** Fila mínima que necesita el reporte: cuánto, cuándo y de quién. */
interface Row {
  confirmedAt: Date;
  total: number;
  freight: number;
  supplierId: string | null;
  supplierName: string;
}

const SIN_PROVEEDOR = 'Sin proveedor';

/**
 * Compras y fletes del período.
 *
 * Lee facturas CONFIRMADAS y las agrupa por período y por proveedor. Es
 * read-only y cross-dominio (facturas + proveedores), que es la excepción
 * documentada para los agregadores de reportes.
 *
 * Se atribuye por `confirmedAt` —el momento en que la mercancía entró al
 * inventario— igual que el flete en el P&G. Que sea la fecha de REGISTRO y no
 * la del papel es decisión del dueño (2026-08-28): la factura se sube el día
 * que llega la mercancía.
 */
@Injectable()
export class PurchasesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getPurchases(
    from: Date,
    to: Date,
    granularity: BucketGranularity,
  ): Promise<PurchasesReport> {
    const rows = await this.loadRows(from, to);

    return {
      periodFrom: ymdLocal(from),
      periodTo: ymdLocal(to),
      granularity,
      totals: figuresOf(rows),
      periods: this.buildPeriods(rows, from, to, granularity),
      bySupplier: buildSuppliers(rows),
    };
  }

  private async loadRows(from: Date, to: Date): Promise<Row[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'CONFIRMED', confirmedAt: { gte: from, lte: to } },
      select: {
        confirmedAt: true,
        total: true,
        freightAmount: true,
        supplierId: true,
        supplier: { select: { name: true } },
      },
    });
    return invoices.map((i) => ({
      // El WHERE ya exige confirmedAt en el rango; el `!` es por el tipo
      // nullable de la columna (una CONFIRMED siempre lo tiene).
      confirmedAt: i.confirmedAt as Date,
      total: Number(i.total ?? 0),
      freight: Number(i.freightAmount),
      supplierId: i.supplierId,
      supplierName: i.supplier?.name ?? SIN_PROVEEDOR,
    }));
  }

  /** Serie cronológica, con los períodos vacíos incluidos (un hueco es dato). */
  private buildPeriods(
    rows: Row[],
    from: Date,
    to: Date,
    granularity: BucketGranularity,
  ): PurchasePeriod[] {
    const porClave = new Map<string, Row[]>();
    for (const r of rows) {
      const key = bucketOf(r.confirmedAt, granularity).key;
      const acc = porClave.get(key);
      if (acc) acc.push(r);
      else porClave.set(key, [r]);
    }
    return bucketsBetween(from, to, granularity).map((b) => ({
      key: b.key,
      label: b.label,
      periodFrom: b.from,
      periodTo: b.to,
      ...figuresOf(porClave.get(b.key) ?? []),
    }));
  }
}

/** Suma un conjunto de facturas. Única fuente de las cifras: totales, período
 *  y proveedor salen de acá, así que no pueden divergir entre sí. */
function figuresOf(rows: Row[]): PurchaseFigures {
  let purchased = 0;
  let freight = 0;
  let invoicesWithFreight = 0;
  for (const r of rows) {
    // `total` incluye el flete (es lo que se pagó); la mercancía es la resta.
    purchased += r.total - r.freight;
    freight += r.freight;
    if (r.freight > 0) invoicesWithFreight += 1;
  }
  purchased = round(purchased);
  freight = round(freight);
  return {
    purchased,
    freight,
    freightPct: purchased > 0 ? round4(freight / purchased) : null,
    invoiceCount: rows.length,
    invoicesWithFreight,
  };
}

/** Por proveedor, con el que MÁS flete cobró arriba: es con quien hay que
 *  hablar. Ordenar por lo comprado pondría primero al más grande, que puede ser
 *  justo el que no cobra domicilio. */
function buildSuppliers(rows: Row[]): PurchaseSupplier[] {
  const porProveedor = new Map<string, { name: string; id: string | null; rows: Row[] }>();
  for (const r of rows) {
    const key = r.supplierId ?? SIN_PROVEEDOR;
    const acc = porProveedor.get(key);
    if (acc) acc.rows.push(r);
    else porProveedor.set(key, { name: r.supplierName, id: r.supplierId, rows: [r] });
  }
  return [...porProveedor.values()]
    .map((g) => ({
      supplierId: g.id,
      supplierName: g.name,
      ...figuresOf(g.rows),
    }))
    .sort((a, b) => b.freight - a.freight || b.purchased - a.purchased);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
