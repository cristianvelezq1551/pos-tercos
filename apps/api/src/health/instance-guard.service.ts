import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { buildOwnerAlert } from '@pos-tercos/domain';
import { businessName } from '../common/business-name';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * El sistema ASUME single-instance: el throttle de rate-limit y los rooms del
 * WS de pedidos web viven en memoria del proceso. Si Railway queda en
 * autoscale (o alguien sube las réplicas "para mejorar"), nada explota — se
 * degrada en silencio: throttle evadible, pedidos web que no suenan en el POS.
 *
 * Este guard convierte esa rotura silenciosa en una alerta ruidosa: cada
 * instancia late en `app_instances` cada minuto; si hay más de una viva
 * durante 3 latidos seguidos (~3 min — tolera el solapamiento normal de un
 * deploy zero-downtime), alerta al dueño por WhatsApp y grita en el log.
 */
@Injectable()
export class InstanceGuardService implements OnModuleInit {
  private readonly logger = new Logger(InstanceGuardService.name);
  private readonly instanceId = randomUUID();

  /** Latidos consecutivos viendo >1 instancia viva. */
  private strikes = 0;
  private lastAlertAtMs = 0;

  /** Viva = latió hace menos de 2.5 min (2 ciclos y medio del cron). */
  private static readonly FRESH_WINDOW_MS = 150_000;
  /** Latidos sostenidos antes de alertar (~3 min > overlap de deploy). */
  private static readonly STRIKES_TO_ALERT = 3;
  /** Re-alerta como mucho una vez por hora mientras persista. */
  private static readonly ALERT_THROTTLE_MS = 3_600_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerNotifications: OwnerNotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.beat().catch((err) => {
      this.logger.warn(`heartbeat inicial falló: ${err instanceof Error ? err.message : err}`);
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async beat(): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.appInstance.upsert({
        where: { id: this.instanceId },
        create: { id: this.instanceId, startedAt: now, lastSeenAt: now },
        update: { lastSeenAt: now },
      });
      // Limpieza de cadáveres (instancias que murieron sin despedirse).
      await this.prisma.appInstance.deleteMany({
        where: { lastSeenAt: { lt: new Date(now.getTime() - 600_000) } },
      });

      const alive = await this.prisma.appInstance.count({
        where: { lastSeenAt: { gte: new Date(now.getTime() - InstanceGuardService.FRESH_WINDOW_MS) } },
      });

      if (alive <= 1) {
        this.strikes = 0;
        return;
      }

      this.strikes += 1;
      this.logger.warn(`${alive} instancias vivas del API (strike ${this.strikes})`);
      if (this.strikes < InstanceGuardService.STRIKES_TO_ALERT) return;
      if (Date.now() - this.lastAlertAtMs < InstanceGuardService.ALERT_THROTTLE_MS) return;

      this.lastAlertAtMs = Date.now();
      this.logger.error(
        `MULTI-INSTANCIA SOSTENIDA: ${alive} instancias del API vivas. ` +
          'El sistema asume 1 réplica (throttle y WS in-memory) — bajar a 1 en Railway.',
      );
      void this.ownerNotifications.alert(
        'multi_instance',
        buildOwnerAlert({
          businessName: businessName(),
          title: 'Hay más de un servidor corriendo',
          body:
            `El sistema detectó ${alive} instancias a la vez y está diseñado para ` +
            'UNA sola: así el límite anti-abuso y los avisos de pedidos web en la ' +
            'caja dejan de ser confiables. Entrar a Railway y fijar el servicio en ' +
            '1 réplica (sin autoscale).',
        }),
        { alive, instanceId: this.instanceId },
      );
    } catch (err) {
      // El guard jamás debe afectar la operación — solo observa.
      this.logger.warn(`heartbeat falló: ${err instanceof Error ? err.message : err}`);
    }
  }
}
