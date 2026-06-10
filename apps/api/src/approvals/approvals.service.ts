import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

/**
 * Aprobaciones inline para acciones del cajero que requieren validación
 * de Admin Operativo o Dueño (architecture.md §7.3).
 *
 * Casos de uso (FASE 5+):
 *   - Anular venta (`POST /sales/:id/void`)
 *   - Aplicar descuento manual >15%
 *   - Abrir cajón sin venta
 *
 * El PIN viaja por header `X-Approval-Pin: <6-digit>`. El backend busca
 * todos los PINs de Admin/Dueño y verifica con bcrypt. Si matchea, devuelve
 * el `userId` del aprobador (para audit log). Si no matchea, 403 +
 * `APPROVAL_DENIED` audit.
 *
 * El trigger DB `trg_approval_pins_role_check` ya garantiza que solo
 * usuarios con role IN (ADMIN_OPERATIVO, DUENO) pueden tener PIN, así que
 * cualquier match es válido por construcción.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica la contraseña de `userId`. Se usa como segundo factor para CAMBIAR
   * un PIN: si una sesión queda abierta, no alcanza con estar logueado para
   * tocar PINs — hay que reingresar la clave. 401 si no matchea.
   */
  async assertPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new ForbiddenException('Contraseña incorrecta.');
    }
  }

  /**
   * Setea (o resetea) el PIN para `userId`. Solo lo invoca:
   *   - El propio Admin/Dueño cambiando su PIN.
   *   - El Dueño reseteando el de un Admin Operativo (FASE 11).
   *
   * En FASE 5: solo Dueño-only via controller.
   */
  async setPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException('PIN debe ser exactamente 6 dígitos');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!user.active) {
      throw new BadRequestException(`User ${userId} is inactive`);
    }
    if (user.role !== 'ADMIN_OPERATIVO' && user.role !== 'DUENO') {
      throw new BadRequestException(
        `Solo ADMIN_OPERATIVO o DUENO pueden tener PIN (este user es ${user.role})`,
      );
    }

    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    await this.prisma.approvalPin.upsert({
      where: { userId },
      create: { userId, pinHash: hash },
      update: { pinHash: hash },
    });
  }

  /**
   * Busca un PIN válido entre todos los Admin/Dueño activos. Retorna el
   * `userId` del aprobador si encuentra match. Lanza `ForbiddenException`
   * si ningún PIN matchea.
   *
   * El loop sobre TODOS los PINs es O(n) en bcrypt comparisons. Aceptable
   * porque hay máximo ~5 admins en un negocio. Si crece, indexar por
   * primeros 2 dígitos del PIN o algo parecido (FASE 14).
   */
  async verify(pin: string): Promise<string> {
    if (!/^\d{6}$/.test(pin)) {
      throw new ForbiddenException('PIN inválido');
    }
    const candidates = await this.prisma.approvalPin.findMany({
      where: { user: { active: true } },
      select: { userId: true, pinHash: true },
    });
    if (candidates.length === 0) {
      this.logger.warn('No approval PINs configured — every approval will fail');
      throw new ForbiddenException(
        'No hay PINs de aprobación configurados. Pedí al Dueño que setee uno.',
      );
    }
    for (const c of candidates) {
      // bcrypt.compare es timing-safe.
      const ok = await bcrypt.compare(pin, c.pinHash);
      if (ok) return c.userId;
    }
    throw new ForbiddenException('PIN inválido');
  }

  /**
   * Helper: ¿el user tiene PIN configurado? Útil para UI de FASE 11.
   */
  async hasPin(userId: string): Promise<boolean> {
    const row = await this.prisma.approvalPin.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return row !== null;
  }
}
