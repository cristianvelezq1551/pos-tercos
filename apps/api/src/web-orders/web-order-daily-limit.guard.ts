import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Tope diario de pedidos web POR IP.
 *
 * El anti-abuso de `WebOrdersService` cuenta pedidos PENDIENTES por teléfono
 * (3/día), pero un abusador que rota números `+57` falsos lo evade — y cada
 * pedido dispara una plantilla de WhatsApp con costo real. Este guard agrega un
 * segundo freno por IP (independiente del throttle de 30/min), acotando el daño
 * de un script que rota teléfonos.
 *
 * En memoria a propósito: la API corre en instancia ÚNICA (invariante de deploy,
 * `railway.json numReplicas:1`). Si algún día se escala horizontalmente, mover
 * este contador a storage compartido (Redis) junto con el ThrottlerModule.
 */
@Injectable()
export class WebOrderDailyLimitGuard implements CanActivate {
  private static readonly MAX_PER_IP_PER_DAY = 25;
  private static readonly WINDOW_MS = 24 * 60 * 60 * 1000;
  private static readonly PRUNE_THRESHOLD = 10_000;

  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const now = Date.now();

    if (this.hits.size > WebOrderDailyLimitGuard.PRUNE_THRESHOLD) {
      this.prune(now);
    }

    const entry = this.hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + WebOrderDailyLimitGuard.WINDOW_MS });
      return true;
    }

    if (entry.count >= WebOrderDailyLimitGuard.MAX_PER_IP_PER_DAY) {
      throw new HttpException(
        'Alcanzaste el máximo de pedidos por hoy. Escribinos por WhatsApp para ayudarte.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(ip);
    }
  }
}
