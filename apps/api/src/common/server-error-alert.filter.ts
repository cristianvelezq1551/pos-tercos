import { Catch, HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { OwnerNotificationService } from '../notifications/owner-notification.service';

/** Máximo una alerta cada 10 min por firma de error (no spamear al dueño). */
const ALERT_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Filtro global de excepciones: hereda la RESPUESTA del filtro base de Nest
 * (mismos códigos y bodies de siempre — el httpAdapter lo inyecta el
 * contenedor) y, ante un 5xx INESPERADO (bug, DB caída, adapter roto):
 *  - lo deja en el log con stack completo, y
 *  - alerta al dueño por WhatsApp (throttled por firma de error).
 * Los 4xx (validación, permisos, conflictos de negocio) NO alertan — son
 * operación normal.
 */
@Catch()
export class ServerErrorAlertFilter extends BaseExceptionFilter {
  private readonly alertLogger = new Logger(ServerErrorAlertFilter.name);
  private readonly lastAlertAt = new Map<string, number>();

  constructor(private readonly ownerNotifications: OwnerNotificationService) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;

    if (status >= 500) {
      const req = host.switchToHttp().getRequest<Request>();
      const message = exception instanceof Error ? exception.message : String(exception);
      const signature = `${req?.method ?? '?'} ${normalizePath(req?.url)} :: ${message.slice(0, 80)}`;

      this.alertLogger.error(
        `5xx en ${signature}`,
        exception instanceof Error ? exception.stack : undefined,
      );

      const now = Date.now();
      this.prune(now);
      const last = this.lastAlertAt.get(signature) ?? 0;
      if (now - last >= ALERT_THROTTLE_MS) {
        this.lastAlertAt.set(signature, now);
        void this.ownerNotifications.alert(
          'server_error',
          `[${process.env.BUSINESS_NAME ?? 'Tercos'}] 🔴 Error del sistema\n\n${signature}\n\nSi se repite, revisá los logs del servidor.`,
          { signature, status },
        );
      }
    }

    // La respuesta HTTP sale igual que siempre (filtro default de Nest).
    super.catch(exception, host);
  }

  /** Borra firmas más viejas que la ventana de throttle: el Map no crece. */
  private prune(now: number): void {
    for (const [sig, at] of this.lastAlertAt) {
      if (now - at >= ALERT_THROTTLE_MS) this.lastAlertAt.delete(sig);
    }
  }
}

/**
 * Colapsa la URL al PATRÓN de ruta para que la firma no explote por params:
 * quita el query string y reemplaza UUIDs y segmentos numéricos por `:id`.
 * Sin esto, cada URL distinta (UUIDs, paginación, un scanner) deja una entrada
 * permanente en el Map de throttle → fuga de memoria.
 */
function normalizePath(url: string | undefined): string {
  if (!url) return '?';
  const path = url.split('?')[0] ?? url;
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}
