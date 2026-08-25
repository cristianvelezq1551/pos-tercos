import { Catch, HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { buildOwnerAlert } from '@pos-tercos/domain';
import type { Request, Response } from 'express';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { businessName } from './business-name';

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

    // Un 5xx DELIBERADO del negocio (ej. el 503 del kill-switch de pedidos
    // web) no es un error del sistema: con el switch apagado, cada intento
    // bloqueado alertaría al dueño como "Error del sistema". Solo alertan los 5xx
    // INESPERADOS: excepciones no-HTTP (bugs/DB caída) o un 500 explícito.
    const deliberate5xx = isHttp && status !== 500;

    if (status >= 500 && !deliberate5xx) {
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
          buildOwnerAlert({
            businessName: businessName(),
            title: 'Error del sistema',
            body: `${signature}\n\nSi se repite, revisa los registros del servidor.`,
          }),
          { signature, status },
        );
      }

      // Y NO se le cuenta a la persona: el texto de una excepción cruda
      // ("Cannot read properties of undefined…", un error de Prisma) no la
      // ayuda en nada y de paso revela cómo está hecho el sistema por dentro.
      // Se responde algo accionable; el detalle ya quedó arriba con su stack.
      host.switchToHttp().getResponse<Response>().status(status).json({
        statusCode: status,
        message:
          'El sistema tuvo un problema y no pudo completar la acción. ' +
          'Vuelve a intentar; si sigue igual, avísale al dueño.',
      });
      return;
    }

    // Los 404 los escriben los services como `Sale <uuid> not found`: útil en
    // un log, inservible en pantalla (inglés + un UUID que no le dice nada a
    // nadie). Son ~70 en el código; reescribirlos uno por uno sería ruido, y
    // acá se cubren todos de una — incluidos los clientes futuros.
    if (status === 404 && isHttp && pareceNotFoundTecnico(exception)) {
      host.switchToHttp().getResponse<Response>().status(404).json({
        statusCode: 404,
        message: 'No encontramos lo que buscabas. Puede que ya no exista o que el enlace esté viejo.',
      });
      return;
    }

    // El resto (4xx de negocio, 5xx deliberados como el kill-switch) ya trae
    // su mensaje en castellano escrito por el service: sale igual que siempre.
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

/**
 * ¿El 404 lo escribió un service en inglés, con el id adentro?
 * Ej: "Sale 4605f4c1-… not found", "Ingredient abc not found".
 * Un 404 con mensaje en castellano (los hay) se respeta tal cual.
 */
function pareceNotFoundTecnico(exception: HttpException): boolean {
  const res = exception.getResponse();
  const message =
    typeof res === 'string'
      ? res
      : typeof (res as { message?: unknown })?.message === 'string'
        ? ((res as { message: string }).message)
        : '';
  return /not found|no such|cannot (get|post|patch|delete)/i.test(message);
}
