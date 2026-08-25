import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateSupplier,
  Supplier,
  SupplierProduct,
  UpdateSupplier,
} from '@pos-tercos/types';
import type { Prisma, Supplier as DbSupplier } from '@prisma/client';
import { isUniqueViolation } from '../common/tx';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { onlyActive?: boolean } = {}): Promise<Supplier[]> {
    const where: Prisma.SupplierWhereInput = {};
    if (opts.onlyActive) where.isActive = true;
    const rows = await this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(toSupplierDto);
  }

  async getById(id: string): Promise<Supplier> {
    const row = await this.prisma.supplier.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Supplier ${id} not found`);
    return toSupplierDto(row);
  }

  async findByNit(nit: string): Promise<Supplier | null> {
    const row = await this.prisma.supplier.findUnique({ where: { nit } });
    return row ? toSupplierDto(row) : null;
  }

  async create(input: CreateSupplier): Promise<Supplier> {
    const row = await this.prisma.supplier.create({
      data: {
        nit: input.nit,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
    });
    return toSupplierDto(row);
  }

  async update(id: string, input: UpdateSupplier): Promise<Supplier> {
    await this.assertExists(id);
    const row = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(input.nit !== undefined && { nit: input.nit }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return toSupplierDto(row);
  }

  async deactivate(id: string): Promise<Supplier> {
    await this.assertExists(id);
    const row = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    return toSupplierDto(row);
  }

  /**
   * FASE 4 ajustes 2.7: lista los items que el proveedor vende (insumos
   * + productos direct-resale) con su último precio + última fecha de
   * compra. Polimórfico via entityType.
   */
  async getProducts(supplierId: string): Promise<SupplierProduct[]> {
    await this.assertExists(supplierId);
    const rows = await this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        ingredient: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { lastPurchaseDate: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      supplierId: r.supplierId,
      entityType: r.entityType,
      ingredientId: r.ingredientId,
      productId: r.productId,
      name: r.ingredient?.name ?? r.product?.name ?? '(eliminado)',
      lastUnitPrice: r.lastUnitPrice !== null ? Number(r.lastUnitPrice) : null,
      lastPurchaseDate: r.lastPurchaseDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Para uso de InvoicesService al confirmar una factura: si el NIT ya existe
   * lo retorna, si no lo crea con el name extraído.
   *
   * El `upsert` de Prisma es SELECT-y-después-INSERT, no atómico: dos confirms
   * concurrentes de la MISMA factura (doble clic, reintento automático) con un
   * proveedor que todavía no existe no encuentran nada los dos, insertan los
   * dos, y el perdedor muere con P2002. Eso pasa ANTES del claim atómico del
   * confirm, así que en vez del 400 limpio ("ya fue confirmada") el cajero veía
   * un 500 —y al dueño le llegaba un WhatsApp de "Error del sistema" por una
   * factura que se guardó bien—. El perdedor RELEE la fila ganadora, que es
   * exactamente lo que quería: el proveedor existe, que es todo lo que importa.
   */
  async upsertByNit(nit: string, name: string): Promise<Supplier> {
    try {
      const row = await this.prisma.supplier.upsert({
        where: { nit },
        create: { nit, name },
        update: {},
      });
      return toSupplierDto(row);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner = await this.prisma.supplier.findUnique({ where: { nit } });
      // Sin ganador el P2002 vino de otra restricción → que suba como estaba.
      if (!winner) throw e;
      return toSupplierDto(winner);
    }
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.supplier.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Supplier ${id} not found`);
  }
}

function toSupplierDto(row: DbSupplier): Supplier {
  return {
    id: row.id,
    nit: row.nit,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
