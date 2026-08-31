import { Global, Logger, Module } from '@nestjs/common';
import type { PushNotifier } from '@pos-tercos/domain';
import { NoopPushAdapter } from './noop.adapter';
import { assertVapidKeyPair } from './web-push-crypto';
import { WebPushAdapter } from './web-push.adapter';

export const PUSH_NOTIFIER = Symbol('PUSH_NOTIFIER');

const logger = new Logger('PushModule');

/**
 * Notificaciones del navegador. Mismo patrón que AlertsModule/WhatsAppModule:
 * factory lazy, TODO-O-NADA. Una config a medias en producción significaría
 * cero avisos sin que nadie lo note — el agujero que este módulo viene a tapar.
 *
 * Las llaves se generan una sola vez con:
 *   pnpm -F @pos-tercos/api llaves:vapid
 */
@Global()
@Module({
  providers: [
    NoopPushAdapter,
    {
      provide: PUSH_NOTIFIER,
      useFactory: (noop: NoopPushAdapter): PushNotifier => {
        const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
        const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
        const subject = process.env.VAPID_SUBJECT?.trim();
        const puestas = [publicKey, privateKey, subject].filter(
          (v) => v !== undefined && v.length > 0,
        ).length;

        if (puestas > 0 && puestas < 3) {
          throw new Error(
            'Config VAPID_* incompleta: se necesitan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (o ninguna).',
          );
        }
        if (puestas === 3) {
          // `mailto:` o `https:` — el RFC 8292 lo exige y algunos servicios de
          // push rechazan el JWT si no lo cumple.
          if (!/^(mailto:|https:\/\/)/.test(subject as string)) {
            throw new Error('VAPID_SUBJECT debe empezar con "mailto:" o "https://".');
          }
          // Se comprueba al ARRANCAR, no en el primer aviso: un par mal
          // copiado no da error hasta que el servicio de push responde 401, y
          // para entonces los avisos llevan días mudos.
          assertVapidKeyPair({
            publicKey: publicKey as string,
            privateKey: privateKey as string,
          });
          logger.log('Notificaciones del navegador activas (VAPID_* detectadas)');
          return new WebPushAdapter({
            publicKey: publicKey as string,
            privateKey: privateKey as string,
            subject: subject as string,
          });
        }
        logger.warn('VAPID_* ausentes — las alertas del negocio solo quedan en el log');
        return noop;
      },
      inject: [NoopPushAdapter],
    },
  ],
  exports: [PUSH_NOTIFIER],
})
export class PushModule {}
