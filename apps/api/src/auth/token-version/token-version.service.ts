import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Cache corto para no consultar la DB en cada request autenticado. */
const TTL_MS = 60_000;

/**
 * Fuente de verdad de la "versión de sesión" de cada usuario. El JwtAuthGuard
 * compara `payload.tv` contra este valor; si no coincide, el access fue
 * revocado (baja/cambio de rol/reset de password) y se rechaza — aunque el
 * token de 24h no haya expirado.
 *
 * - `current()` cachea 60s: la baja se propaga en ≤60s sin pegarle a la DB en
 *   cada request.
 * - `invalidate()` lo borra del cache para que el corte sea INMEDIATO en la
 *   misma instancia (el TTL es el respaldo para multi-instancia).
 */
@Injectable()
export class TokenVersionService {
  private readonly cache = new Map<string, { version: number; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async current(userId: string): Promise<number> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.version;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true, active: true },
    });
    // Usuario inexistente o inactivo → -1: no matchea ningún token (tv>=0).
    const version = user && user.active ? user.tokenVersion : -1;
    this.cache.set(userId, { version, expiresAt: Date.now() + TTL_MS });
    return version;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
