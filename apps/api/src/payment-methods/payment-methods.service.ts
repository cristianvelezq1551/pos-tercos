import { BadRequestException, Injectable } from '@nestjs/common';
import type { PaymentMethodSetting, UpdatePaymentMethods } from '@pos-tercos/types';
import type { PaymentMethod } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Catálogo completo + defaults (CASH/TRANSFER prendidos) si la tabla está vacía. */
const DEFAULTS: Array<{ method: PaymentMethod; enabled: boolean; sortOrder: number }> = [
  { method: 'CASH', enabled: true, sortOrder: 1 },
  { method: 'TRANSFER', enabled: true, sortOrder: 2 },
  { method: 'CARD', enabled: false, sortOrder: 3 },
  { method: 'NEQUI', enabled: false, sortOrder: 4 },
  { method: 'DAVIPLATA', enabled: false, sortOrder: 5 },
  { method: 'QR_BANCOLOMBIA', enabled: false, sortOrder: 6 },
];

/**
 * Medios de pago configurables. El catálogo es el enum PaymentMethod (no se
 * inventan métodos arbitrarios — recibos, reconciliación y reportes dependen
 * de él); el admin habilita cuáles ofrece el POS.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lista completa (auto-siembra defaults si la tabla quedó vacía). */
  async listAll(): Promise<PaymentMethodSetting[]> {
    let rows = await this.prisma.paymentMethodSetting.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    if (rows.length === 0) {
      await this.prisma.paymentMethodSetting.createMany({
        data: DEFAULTS,
        skipDuplicates: true,
      });
      rows = await this.prisma.paymentMethodSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      });
    }
    return rows.map((r) => ({
      method: r.method,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    }));
  }

  /** Solo los habilitados (lo que ve el cajero al cobrar). */
  async listEnabled(): Promise<PaymentMethodSetting[]> {
    return (await this.listAll()).filter((m) => m.enabled);
  }

  /** Set de métodos habilitados (validación del cobro). */
  async enabledSet(): Promise<Set<string>> {
    return new Set((await this.listEnabled()).map((m) => m.method));
  }

  async update(input: UpdatePaymentMethods, userId: string): Promise<PaymentMethodSetting[]> {
    const current = await this.listAll();
    const next = new Map(current.map((m) => [m.method, m.enabled]));
    for (const m of input.methods) next.set(m.method, m.enabled);
    if (![...next.values()].some(Boolean)) {
      // Defensa server-side del superRefine: nunca 0 métodos activos.
      throw new BadRequestException('Debe quedar al menos un medio de pago habilitado.');
    }
    for (const m of input.methods) {
      await this.prisma.paymentMethodSetting.update({
        where: { method: m.method as PaymentMethod },
        data: { enabled: m.enabled },
      });
    }
    await this.audit.log({
      userId,
      action: 'PAYMENT_METHODS_UPDATED',
      entityType: 'payment_method_settings',
      metadata: { changes: input.methods },
    });
    return this.listAll();
  }
}
