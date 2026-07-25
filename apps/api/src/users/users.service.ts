import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User as DbUser, Prisma } from '@prisma/client';
import type {
  CreateUser,
  ManagedUser,
  SetEmployment,
  TerminateEmployment,
  UpdateUser,
  User,
} from '@pos-tercos/types';
import * as bcrypt from 'bcrypt';
import { ApprovalsService } from '../approvals/approvals.service';
import { TokenVersionService } from '../auth/token-version/token-version.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;
const PIN_ROLES = ['ADMIN_OPERATIVO', 'DUENO'];
// El negocio cierra los lunes: todo empleado nuevo nace descansando el lunes
// (1 = lunes, 0=domingo … 6=sábado) para que la nómina/P&G no lo cuente por
// defecto. Se ajusta después en el perfil si el trabajador sí opera los lunes.
const DEFAULT_REST_DAYS = [1];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly tokenVersions: TokenVersionService,
  ) {}

  async findByEmail(email: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getById(id: string): Promise<DbUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /** Resuelve nombres por id (para mostrar autores sin exponer la entidad User). */
  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  // ==================================================================
  // Gestión de usuarios (admin) — DUENO-only via controller
  // ==================================================================

  /**
   * Dueño principal = el DUENO más antiguo (primer creado). Es intocable: nadie
   * lo elimina, ni le cambia PIN/clave, ni lo desactiva o cambia de rol. Él sí
   * gestiona a todos los demás (incluidos otros dueños).
   */
  async getPrimaryOwnerId(): Promise<string | null> {
    const first = await this.prisma.user.findFirst({
      where: { role: 'DUENO' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  private async assertNotPrimaryOwner(targetId: string, message: string): Promise<void> {
    const primaryId = await this.getPrimaryOwnerId();
    if (primaryId && targetId === primaryId) {
      throw new BadRequestException(message);
    }
  }

  private toManaged(u: DbUser, hasPin: boolean, primaryOwnerId: string | null): ManagedUser {
    return {
      ...this.toPublic(u),
      hasPin,
      isPrimaryOwner: u.id === primaryOwnerId,
      ...employment(u),
    };
  }

  async listManaged(): Promise<ManagedUser[]> {
    const [users, pins, primaryOwnerId] = await Promise.all([
      this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { fullName: 'asc' }] }),
      this.prisma.approvalPin.findMany({ select: { userId: true } }),
      this.getPrimaryOwnerId(),
    ]);
    const withPin = new Set(pins.map((p) => p.userId));
    return users.map((u) => this.toManaged(u, withPin.has(u.id), primaryOwnerId));
  }

  async create(dto: CreateUser, actorId: string): Promise<ManagedUser> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException(`Ya existe un usuario con el correo ${email}.`);
    }
    if (dto.pin && !PIN_ROLES.includes(dto.role)) {
      throw new BadRequestException('Solo ADMIN_OPERATIVO o DUENO pueden tener PIN.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const created = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        phone: dto.phone ?? null,
        role: dto.role,
        passwordHash,
        // Forzar cambio de contraseña en el primer ingreso del empleado.
        mustChangePwd: true,
        active: true,
        hireDate: dto.hireDate ? new Date(`${dto.hireDate}T00:00:00.000Z`) : null,
        payType: dto.payType ?? null,
        salaryAmount: dto.salaryAmount ?? null,
        restDaysOfWeek: DEFAULT_REST_DAYS,
      },
    });

    if (dto.pin) {
      await this.approvals.setPin(created.id, dto.pin);
    }

    await this.audit.log({
      userId: actorId,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: created.id,
      metadata: { email, role: dto.role, withPin: Boolean(dto.pin) },
    });

    return this.toManaged(created, Boolean(dto.pin), await this.getPrimaryOwnerId());
  }

  async update(id: string, dto: UpdateUser, actorId: string): Promise<ManagedUser> {
    const existing = await this.getById(id);

    const willBeActive = dto.active ?? existing.active;
    const willBeRole = dto.role ?? existing.role;

    // No dejar el sistema sin un Dueño activo (anti-lockout).
    const losesDueno =
      existing.role === 'DUENO' && (willBeRole !== 'DUENO' || !willBeActive);
    if (losesDueno) {
      const otherActiveDuenos = await this.prisma.user.count({
        where: { role: 'DUENO', active: true, id: { not: id } },
      });
      if (otherActiveDuenos === 0) {
        throw new BadRequestException(
          'No puedes dejar el sistema sin un Dueño activo. Asigna otro Dueño primero.',
        );
      }
    }
    // No auto-desactivarse (evita quedar fuera de tu propia sesión).
    if (dto.active === false && id === actorId) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    // El dueño principal no se puede desactivar ni cambiar de rol (sí editar nombre/teléfono).
    if (willBeRole !== 'DUENO' || !willBeActive) {
      await this.assertNotPrimaryOwner(
        id,
        'No se puede desactivar ni cambiar el rol del dueño principal.',
      );
    }

    // Cambio de rol o desactivación → invalidar la sesión vigente (no esperar
    // 24h a que expire el access).
    const roleChanged = dto.role !== undefined && dto.role !== existing.role;
    const willDeactivate = existing.active && dto.active === false;
    const bumpToken = roleChanged || willDeactivate;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone,
        role: dto.role,
        active: dto.active,
        ...(bumpToken ? { tokenVersion: { increment: 1 } } : {}),
      },
    });

    // Al desactivar, revocar refresh tokens para cortar la sesión.
    const becameInactive = existing.active && updated.active === false;
    if (becameInactive) {
      await this.revokeRefreshTokens(id);
    }
    if (bumpToken) this.tokenVersions.invalidate(id);

    await this.audit.log({
      userId: actorId,
      action: becameInactive
        ? 'USER_DEACTIVATED'
        : !existing.active && updated.active
          ? 'USER_REACTIVATED'
          : 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      metadata: {
        changes: {
          fullName: dto.fullName,
          phone: dto.phone,
          role: dto.role,
          active: dto.active,
        },
      },
    });

    const [hasPin, primaryOwnerId] = await Promise.all([
      this.approvals.hasPin(id),
      this.getPrimaryOwnerId(),
    ]);
    return this.toManaged(updated, hasPin, primaryOwnerId);
  }

  async resetPassword(id: string, newPassword: string, actorId: string): Promise<void> {
    const user = await this.getById(id);
    await this.assertNotPrimaryOwner(id, 'No se puede cambiar la contraseña del dueño principal.');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePwd: true, tokenVersion: { increment: 1 } },
    });
    // Forzar re-login con la nueva clave en todos los dispositivos.
    await this.revokeRefreshTokens(id);
    this.tokenVersions.invalidate(id);
    await this.audit.log({
      userId: actorId,
      action: 'USER_PASSWORD_RESET',
      entityType: 'user',
      entityId: id,
      metadata: { email: user.email },
    });
  }

  async setPin(id: string, pin: string, password: string, actorId: string): Promise<void> {
    await this.assertNotPrimaryOwner(
      id,
      'No se puede cambiar el PIN del dueño principal. Ese dueño cambia su propio PIN desde su sesión.',
    );
    // Reingreso de contraseña del que hace el cambio: protege contra sesión abierta.
    await this.approvals.assertPassword(actorId, password);
    await this.approvals.setPin(id, pin); // valida rol admin/dueño + activo
    await this.audit.log({
      userId: actorId,
      action: 'USER_PIN_SET',
      entityType: 'user',
      entityId: id,
    });
  }

  /**
   * Cambia el EMPLEO (tipo de pago + salario + vinculación). Requiere PIN de
   * aprobación (Dueño) — es plata. Audita el antes/después + el aprobador.
   */
  async setEmployment(
    id: string,
    dto: SetEmployment,
    pin: string,
    actorId: string,
  ): Promise<ManagedUser> {
    const before = await this.getById(id);
    const approverId = await this.approvals.verify(pin); // 403 si el PIN no matchea
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        payType: dto.payType,
        salaryAmount: dto.salaryAmount,
        ...(dto.hireDate !== undefined && {
          hireDate: dto.hireDate ? new Date(`${dto.hireDate}T00:00:00.000Z`) : null,
        }),
        ...(dto.restDaysOfWeek !== undefined && {
          restDaysOfWeek: dto.restDaysOfWeek,
        }),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'USER_SALARY_CHANGED',
      entityType: 'user',
      entityId: id,
      metadata: {
        approverId,
        before: {
          payType: before.payType,
          salaryAmount: numOrNull(before.salaryAmount),
          restDaysOfWeek: before.restDaysOfWeek ?? [],
        },
        after: {
          payType: updated.payType,
          salaryAmount: numOrNull(updated.salaryAmount),
          restDaysOfWeek: updated.restDaysOfWeek ?? [],
        },
      },
    });
    const [hasPin, primaryOwnerId] = await Promise.all([
      this.approvals.hasPin(id),
      this.getPrimaryOwnerId(),
    ]);
    return this.toManaged(updated, hasPin, primaryOwnerId);
  }

  /**
   * Termina el empleo: fija fecha de salida, INACTIVA el usuario y corta sus
   * sesiones. La nómina queda liquidada hasta esa fecha (proración) y deja de
   * aparecer en pagos posteriores.
   */
  async terminate(
    id: string,
    dto: TerminateEmployment,
    pin: string,
    actorId: string,
  ): Promise<ManagedUser> {
    const existing = await this.getById(id);
    const approverId = await this.approvals.verify(pin); // 403 si el PIN no matchea
    await this.assertNotPrimaryOwner(id, 'No se puede terminar el empleo del dueño principal.');
    if (existing.role === 'DUENO') {
      const otherActiveDuenos = await this.prisma.user.count({
        where: { role: 'DUENO', active: true, id: { not: id } },
      });
      if (otherActiveDuenos === 0) {
        throw new BadRequestException('No puedes terminar al único Dueño activo.');
      }
    }
    if (id === actorId) {
      throw new BadRequestException('No puedes terminar tu propio empleo.');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        terminationDate: new Date(`${dto.date}T00:00:00.000Z`),
        active: false,
        tokenVersion: { increment: 1 },
      },
    });
    await this.revokeRefreshTokens(id);
    this.tokenVersions.invalidate(id);
    await this.audit.log({
      userId: actorId,
      action: 'EMPLOYMENT_TERMINATED',
      entityType: 'user',
      entityId: id,
      metadata: { approverId, email: existing.email, date: dto.date, note: dto.note ?? null },
    });
    const [hasPin, primaryOwnerId] = await Promise.all([
      this.approvals.hasPin(id),
      this.getPrimaryOwnerId(),
    ]);
    return this.toManaged(updated, hasPin, primaryOwnerId);
  }

  /**
   * Elimina DEFINITIVAMENTE un usuario (despido / creado por error). Solo es
   * posible si NO tiene historial operativo (ventas, turnos, auditoría como
   * actor, etc.): el `audit_log` es insert-only por diseño, así que un usuario
   * que alguna vez operó NO se puede borrar sin destruir el rastro contable.
   * En ese caso se exige usar "Terminar empleo" (inactiva y conserva todo).
   * Borra en cascada solo lo propio del empleado (días, novedades, tokens, PIN).
   */
  async deleteUser(id: string, pin: string, actorId: string): Promise<void> {
    const existing = await this.getById(id);
    const approverId = await this.approvals.verify(pin); // 403 si el PIN no matchea
    await this.assertNotPrimaryOwner(id, 'No se puede eliminar al dueño principal.');
    if (id === actorId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario.');
    }
    if (existing.role === 'DUENO') {
      const otherDuenos = await this.prisma.user.count({
        where: { role: 'DUENO', id: { not: id } },
      });
      if (otherDuenos === 0) {
        throw new BadRequestException('No puedes eliminar al único Dueño.');
      }
    }
    // El audit_log registra TODA acción (login, ventas, turnos, inventario…) con
    // user_id = actor. Si tiene aunque sea una entrada, ya operó → no se borra
    // (destruiría el rastro contable). Es proxy completo de "tiene historial".
    const historyCount = await this.prisma.auditLog.count({ where: { userId: id } });
    if (historyCount > 0) {
      throw new ConflictException(
        'No se puede eliminar: el usuario tiene historial (inició sesión u operó: ventas, turnos, etc.). Usa "Terminar empleo" para inactivarlo; su historial se conserva.',
      );
    }
    try {
      await this.prisma.$transaction([
        this.prisma.payrollDay.deleteMany({ where: { userId: id } }),
        this.prisma.payrollAdjustment.deleteMany({ where: { userId: id } }),
        this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
        this.prisma.approvalPin.deleteMany({ where: { userId: id } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
    } catch (e) {
      // Red de seguridad: cualquier FK residual → mismo mensaje guía.
      if ((e as { code?: string }).code?.startsWith('P2') ?? false) {
        throw new ConflictException(
          'No se puede eliminar: el usuario tiene historial operativo. Usa "Terminar empleo" para inactivarlo; su historial se conserva.',
        );
      }
      throw e;
    }
    await this.audit.log({
      userId: actorId,
      action: 'USER_DELETED',
      entityType: 'user',
      entityId: id,
      metadata: { approverId, email: existing.email, role: existing.role },
    });
  }

  private async revokeRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toPublic(u: DbUser): User {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role as User['role'],
      mustChangePwd: u.mustChangePwd,
      active: u.active,
      createdAt: u.createdAt.toISOString(),
    };
  }
}

function numOrNull(d: Prisma.Decimal | null): number | null {
  return d === null ? null : Number(d);
}

/** Proyecta los campos de empleo a la API. */
function employment(u: DbUser): {
  hireDate: string | null;
  payType: ManagedUser['payType'];
  salaryAmount: number | null;
  terminationDate: string | null;
  restDaysOfWeek: number[];
} {
  return {
    hireDate: u.hireDate ? u.hireDate.toISOString() : null,
    payType: u.payType,
    salaryAmount: numOrNull(u.salaryAmount),
    terminationDate: u.terminationDate ? u.terminationDate.toISOString() : null,
    restDaysOfWeek: u.restDaysOfWeek ?? [],
  };
}
