import { Injectable, Logger } from '@nestjs/common';
import type { AlertChannel, AlertDeliveryResult, SystemAlert } from '@pos-tercos/domain';

/**
 * Sin canal configurado (dev, o prod sin las `ALERT_GITHUB_*`): deja el aviso
 * en el log y declara `delivers: false`. NO devuelve `ok: true` — fingir el
 * envío fue exactamente lo que hizo que la bitácora afirmara durante meses
 * alertas que nunca salieron (§7.v22).
 */
@Injectable()
export class NoopAlertAdapter implements AlertChannel {
  readonly name = 'noop';
  readonly delivers = false;

  private readonly logger = new Logger(NoopAlertAdapter.name);

  send(alert: SystemAlert): Promise<AlertDeliveryResult> {
    this.logger.warn(`Sin canal de alertas: '${alert.signature}' NO se avisó a nadie.`);
    return Promise.resolve({ ok: false, delivered: false, error: 'sin canal configurado' });
  }
}
