import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreatePaymentMethod,
  PaymentMethodSetting,
  UpdatePaymentMethod,
} from '@pos-tercos/types';
import { CASH_METHOD_CODE, RECONCILIATION_SOURCES } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type ReconciliationSource = (typeof RECONCILIATION_SOURCES)[number];

/** Built-ins que se siembran si la tabla quedara vacía (defensa; la migración ya los crea). */
const BUILTIN_DEFAULTS = [
  {
    code: 'CASH',
    name: 'Efectivo',
    enabled: true,
    isCash: true,
    requiresVerification: false,
    reconciliationSource: null as string | null,
    isSystem: true,
    sortOrder: 1,
  },
  {
    code: 'TRANSFER',
    name: 'Transferencia',
    enabled: true,
    isCash: false,
    requiresVerification: true,
    reconciliationSource: 'BANCOLOMBIA_CSV' as string | null,
    isSystem: false,
    sortOrder: 2,
  },
  {
    code: 'CARD',
    name: 'Tarjeta',
    enabled: false,
    isCash: false,
    requiresVerification: true,
    reconciliationSource: null as string | null,
    isSystem: false,
    sortOrder: 3,
  },
  {
    code: 'NEQUI',
    name: 'Nequi',
    enabled: false,
    isCash: false,
    requiresVerification: true,
    reconciliationSource: 'NEQUI_CSV' as string | null,
    isSystem: false,
    sortOrder: 4,
  },
];

/**
 * Medios de pago dinámicos: la tabla `payment_method_settings` es la fuente de
 * verdad de la identidad del método (el dueño crea/edita/borra desde el admin).
 * `CASH` es built-in de sistema (no se borra) porque el cajón y el arqueo de
 * efectivo dependen de él. Los custom son siempre digitales.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Siembra los built-ins si la tabla quedó vacía (idempotente). */
  private async ensureSeeded(): Promise<void> {
    const count = await this.prisma.paymentMethodSetting.count();
    if (count === 0) {
      await this.prisma.paymentMethodSetting.createMany({
        data: BUILTIN_DEFAULTS,
        skipDuplicates: true,
      });
    }
  }

  /** Lista completa (auto-siembra los built-ins si la tabla quedó vacía). */
  async listAll(): Promise<PaymentMethodSetting[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.paymentMethodSetting.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toDto);
  }

  /** Solo los habilitados (lo que ve el cajero al cobrar). */
  async listEnabled(): Promise<PaymentMethodSetting[]> {
    return (await this.listAll()).filter((m) => m.enabled);
  }

  /** Set de códigos habilitados (validación del cobro). */
  async enabledSet(): Promise<Set<string>> {
    return new Set((await this.listEnabled()).map((m) => m.code));
  }

  /** Códigos habilitados que exigen verificar comprobante (digitales). */
  async requiresVerificationSet(): Promise<Set<string>> {
    return new Set(
      (await this.listEnabled()).filter((m) => m.requiresVerification).map((m) => m.code),
    );
  }

  /** Códigos (habilitados o no) atados a un CSV de reconciliación. */
  async methodsForReconciliation(source: ReconciliationSource): Promise<string[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.paymentMethodSetting.findMany({
      where: { reconciliationSource: source },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  }

  async create(input: CreatePaymentMethod, userId: string): Promise<PaymentMethodSetting> {
    await this.ensureSeeded();
    const code = await this.deriveUniqueCode(input.name);
    const maxOrder = await this.prisma.paymentMethodSetting.aggregate({
      _max: { sortOrder: true },
    });
    const row = await this.prisma.paymentMethodSetting.create({
      data: {
        code,
        name: input.name,
        enabled: input.enabled,
        isCash: false,
        requiresVerification: input.requiresVerification,
        reconciliationSource: input.reconciliationSource,
        isSystem: false,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    await this.audit.log({
      userId,
      action: 'PAYMENT_METHODS_UPDATED',
      entityType: 'payment_method_settings',
      entityId: code,
      metadata: { op: 'created', method: row },
    });
    return toDto(row);
  }

  async update(
    code: string,
    input: UpdatePaymentMethod,
    userId: string,
  ): Promise<PaymentMethodSetting> {
    await this.ensureSeeded();
    const current = await this.prisma.paymentMethodSetting.findUnique({ where: { code } });
    if (!current) throw new NotFoundException(`El medio de pago ${code} no existe.`);

    if (input.enabled === false && current.enabled) {
      await this.assertNotLastEnabled(code);
    }

    const row = await this.prisma.paymentMethodSetting.update({
      where: { code },
      data: {
        name: input.name,
        enabled: input.enabled,
        requiresVerification: input.requiresVerification,
        reconciliationSource: input.reconciliationSource,
        sortOrder: input.sortOrder,
      },
    });
    await this.audit.log({
      userId,
      action: 'PAYMENT_METHODS_UPDATED',
      entityType: 'payment_method_settings',
      entityId: code,
      metadata: { op: 'updated', before: toDto(current), after: toDto(row) },
    });
    return toDto(row);
  }

  async remove(code: string, userId: string): Promise<void> {
    await this.ensureSeeded();
    const current = await this.prisma.paymentMethodSetting.findUnique({ where: { code } });
    if (!current) throw new NotFoundException(`El medio de pago ${code} no existe.`);
    if (current.isSystem) {
      throw new BadRequestException(`${current.name} es un medio del sistema y no se puede borrar.`);
    }
    if (current.enabled) await this.assertNotLastEnabled(code);

    await this.prisma.paymentMethodSetting.delete({ where: { code } });
    await this.audit.log({
      userId,
      action: 'PAYMENT_METHODS_UPDATED',
      entityType: 'payment_method_settings',
      entityId: code,
      metadata: { op: 'deleted', method: toDto(current) },
    });
  }

  /** El POS no puede quedarse sin formas de cobrar. */
  private async assertNotLastEnabled(excludingCode: string): Promise<void> {
    const otherEnabled = await this.prisma.paymentMethodSetting.count({
      where: { enabled: true, code: { not: excludingCode } },
    });
    if (otherEnabled === 0) {
      throw new BadRequestException('Debe quedar al menos un medio de pago habilitado.');
    }
  }

  /** Slug UPPER_SNAKE del nombre, único (sufijo numérico si colisiona). */
  private async deriveUniqueCode(name: string): Promise<string> {
    const base = slugifyCode(name);
    if (!base) throw new BadRequestException('El nombre no genera un código válido.');
    if (base === CASH_METHOD_CODE) {
      throw new ConflictException('Ya existe el medio de pago Efectivo.');
    }
    const existing = new Set(
      (await this.prisma.paymentMethodSetting.findMany({ select: { code: true } })).map(
        (r) => r.code,
      ),
    );
    if (!existing.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}_${i}`;
      if (!existing.has(candidate)) return candidate;
    }
    throw new ConflictException('No se pudo generar un código único para el medio de pago.');
  }
}

function toDto(row: {
  code: string;
  name: string;
  enabled: boolean;
  isCash: boolean;
  requiresVerification: boolean;
  reconciliationSource: string | null;
  isSystem: boolean;
  sortOrder: number;
}): PaymentMethodSetting {
  return {
    code: row.code,
    name: row.name,
    enabled: row.enabled,
    isCash: row.isCash,
    requiresVerification: row.requiresVerification,
    reconciliationSource: row.reconciliationSource as ReconciliationSource | null,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
  };
}

function slugifyCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
