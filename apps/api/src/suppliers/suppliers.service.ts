import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSupplier, Supplier, UpdateSupplier } from '@pos-tercos/types';
import type { Prisma, Supplier as DbSupplier } from '@prisma/client';
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
   * Para uso de InvoicesService al confirmar una factura: si el NIT ya existe
   * lo retorna, si no lo crea con el name extraído.
   */
  async upsertByNit(nit: string, name: string): Promise<Supplier> {
    const row = await this.prisma.supplier.upsert({
      where: { nit },
      create: { nit, name },
      update: {},
    });
    return toSupplierDto(row);
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
