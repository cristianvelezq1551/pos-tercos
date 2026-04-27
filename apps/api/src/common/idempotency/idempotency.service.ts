import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyKeySchema } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CachedResponse<T> {
  statusCode: number;
  body: T;
}

const DEFAULT_TTL_DAYS = 7;

/**
 * Cache de respuestas para POSTs idempotentes (POST /sales, POST /shifts/open,
 * etc.). El cliente envía header `Idempotency-Key`; si la key ya fue procesada
 * con éxito en los últimos `ttlDays` días, retornamos la respuesta cacheada
 * sin re-ejecutar la lógica.
 *
 * Cleanup de keys expiradas: cron job en FASE 5.C (junto con receipt-gap
 * detection cron). Mientras tanto, `findCached` filtra por `expires_at > NOW()`,
 * así que keys expiradas no se sirven aunque queden en DB.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca respuesta cacheada para `(key, endpoint)`. Solo retorna si la key
   * matchea el endpoint (previene reuso accidental entre rutas).
   */
  async findCached<T>(
    key: string,
    endpoint: string,
  ): Promise<CachedResponse<T> | null> {
    if (!IdempotencyKeySchema.safeParse(key).success) return null;
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!row) return null;
    if (row.expiresAt <= new Date()) return null;
    if (row.endpoint !== endpoint) {
      // Llave reusada para otra ruta. Audit-worthy en producción.
      this.logger.warn(
        `Idempotency key ${key} reused across endpoints (${row.endpoint} vs ${endpoint})`,
      );
      return null;
    }
    return {
      statusCode: row.statusCode,
      body: row.responseJson as T,
    };
  }

  /**
   * Persiste respuesta exitosa. Si la key ya existía (race condition), NO
   * la sobreescribe — la primera respuesta gana.
   */
  async cache<T>(input: {
    key: string;
    endpoint: string;
    body: T;
    statusCode: number;
    userId?: string;
    ttlDays?: number;
  }): Promise<void> {
    const ttl = input.ttlDays ?? DEFAULT_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key: input.key,
          endpoint: input.endpoint,
          responseJson: (input.body ?? null) as Prisma.InputJsonValue,
          statusCode: input.statusCode,
          userId: input.userId ?? null,
          expiresAt,
        },
      });
    } catch (err) {
      // P2002 = unique constraint (race). Otra request concurrente ganó —
      // no es error de negocio, no propagar.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') {
        this.logger.debug(`Idempotency key ${input.key} already cached (concurrent)`);
        return;
      }
      // Cualquier otro error: log y continúa. Audit no debería romper la
      // operación de negocio (la respuesta ya se computó y se va a retornar).
      this.logger.error(`Failed to cache idempotency key ${input.key}`, err as Error);
    }
  }

  /**
   * Borrado de keys expiradas. Corre todos los días a las 3:00 AM.
   * También invocable manualmente para testing.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} expired idempotency keys`);
    }
    return result.count;
  }
}
