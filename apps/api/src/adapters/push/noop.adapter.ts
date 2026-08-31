import { Injectable, Logger } from '@nestjs/common';
import type { PushDeliveryResult, PushMessage, PushNotifier } from '@pos-tercos/domain';

/**
 * Sin llaves VAPID configuradas: deja el aviso en el log y declara
 * `delivers: false`. NO devuelve `ok: true` — fingir el envío fue justo lo que
 * hizo que la bitácora afirmara durante meses alertas que nunca salieron
 * (§7.v22).
 */
@Injectable()
export class NoopPushAdapter implements PushNotifier {
  readonly name = 'noop';
  readonly delivers = false;
  readonly publicKey = null;

  private readonly logger = new Logger(NoopPushAdapter.name);

  send(_target: unknown, message: PushMessage): Promise<PushDeliveryResult> {
    this.logger.warn(`Sin llaves VAPID: '${message.title}' NO se avisó a nadie.`);
    return Promise.resolve({ ok: false, gone: false, error: 'sin llaves VAPID configuradas' });
  }
}
