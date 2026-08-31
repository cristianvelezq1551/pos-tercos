import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { PushMessage, PushNotifier } from '@pos-tercos/domain';
import type { PushDevice, PushSendOutcome, PushSubscriptionInput } from '@pos-tercos/types';
import { assertValidSubscriptionKeys } from '../adapters/push/web-push-crypto';
import { PUSH_NOTIFIER } from '../adapters/push/push.module';
import { PrismaService } from '../prisma/prisma.service';

/** Quiénes reciben las alertas de negocio. */
const ROLES_QUE_RECIBEN = ['DUENO', 'ADMIN_OPERATIVO'] as const;

@Injectable()
export class PushSubscriptionsService {
  private readonly logger = new Logger(PushSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_NOTIFIER) private readonly push: PushNotifier,
  ) {}

  get publicKey(): string | null {
    return this.push.publicKey;
  }

  get delivers(): boolean {
    return this.push.delivers;
  }

  /**
   * Alta o actualización del dispositivo. El `endpoint` es la identidad, así
   * que re-suscribir el mismo navegador ACTUALIZA la fila: el navegador rota
   * sus llaves cada tanto por su cuenta y guardar las viejas dejaría avisos que
   * el dispositivo ya no puede descifrar.
   */
  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    // Se valida ANTES de guardar: una llave mal formada solo se descubriría al
    // primer aviso, o sea cuando más importa que salga.
    try {
      assertValidSubscriptionKeys(input.keys);
    } catch (err) {
      // Es un dato malo del cliente, no una falla del servidor: 400, no 500.
      throw new BadRequestException(textoDe(err));
    }
    const datos = {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...datos },
      // Incluye `userId`: en un equipo compartido, quien se suscribe último es
      // quien debe recibir — si no, los avisos le seguirían llegando al anterior.
      update: datos,
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    // Acotado por usuario: nadie desactiva el dispositivo de otro.
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  async listDevices(userId: string, currentEndpoint?: string): Promise<PushDevice[]> {
    const filas = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return filas.map((f) => ({
      id: f.id,
      label: describirDispositivo(f.userAgent),
      createdAt: f.createdAt.toISOString(),
      lastSentAt: f.lastSentAt?.toISOString() ?? null,
      isCurrent: f.endpoint === currentEndpoint,
    }));
  }

  /** Avisa a todos los dispositivos del dueño y los administradores. */
  async broadcastToOwners(message: PushMessage): Promise<PushSendOutcome> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { user: { active: true, role: { in: [...ROLES_QUE_RECIBEN] } } },
    });
    return this.deliver(subs, message);
  }

  /** Avisa solo a los dispositivos de una persona (sirve para la prueba). */
  async sendToUser(userId: string, message: PushMessage): Promise<PushSendOutcome> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    return this.deliver(subs, message);
  }

  private async deliver(
    subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
    message: PushMessage,
  ): Promise<PushSendOutcome> {
    const vacio = { sent: 0, failed: 0, removed: 0 };
    if (!this.push.delivers) {
      return { ...vacio, reason: 'no hay llaves VAPID configuradas en el servidor' };
    }
    if (subs.length === 0) {
      return { ...vacio, reason: 'ningún dispositivo tiene los avisos activados' };
    }

    // En paralelo: un servicio de push lento no debe demorar a los demás, y
    // son pocos dispositivos (el dueño y un par de administradores).
    const resultados = await Promise.all(
      subs.map((s) => this.push.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, message)),
    );

    const muertos = subs.filter((_, i) => resultados[i].gone).map((s) => s.id);
    if (muertos.length > 0) {
      // Se borran acá y no en el próximo aviso: si no, cada envío reintenta
      // dispositivos que ya no existen, para siempre.
      await this.prisma.pushSubscription
        .deleteMany({ where: { id: { in: muertos } } })
        .catch((err: unknown) => {
          this.logger.warn(`No se pudieron borrar suscripciones muertas: ${textoDe(err)}`);
        });
    }

    const enviados = subs.filter((_, i) => resultados[i].ok).map((s) => s.id);
    if (enviados.length > 0) {
      await this.prisma.pushSubscription
        .updateMany({ where: { id: { in: enviados } }, data: { lastSentAt: new Date() } })
        .catch(() => undefined); // marca de uso, no vale tumbar el envío por ella
    }

    const sent = enviados.length;
    const failed = resultados.length - sent;
    return {
      sent,
      failed,
      removed: muertos.length,
      reason: sent === 0 ? 'ningún dispositivo aceptó el aviso' : null,
    };
  }
}

/**
 * Nombre reconocible del dispositivo. No se busca precisión de analítica: la
 * persona solo tiene que distinguir "el celular" del "computador".
 */
export function describirDispositivo(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo';
  const navegador = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Navegador';
  const sistema = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iPhone o iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return sistema ? `${navegador} en ${sistema}` : navegador;
}

function textoDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
