import { Global, Logger, Module } from '@nestjs/common';
import type { WhatsAppProvider } from '@pos-tercos/domain';
import { KapsoWhatsAppAdapter } from './kapso.adapter';
import { MockWhatsAppAdapter } from './mock.adapter';

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

/**
 * Selección lazy del adapter, en orden de preferencia:
 *   1. KAPSO_API_KEY + KAPSO_PHONE_NUMBER_ID → KapsoWhatsAppAdapter (Cloud API oficial).
 *   2. Sin nada → MockWhatsAppAdapter (dev, solo loggea).
 * Mismo patrón que StorageModule: el adapter real se instancia a mano en el
 * factory para que dev funcione sin ninguna variable configurada.
 */
const logger = new Logger('WhatsAppModule');

@Global()
@Module({
  providers: [
    MockWhatsAppAdapter,
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (mock: MockWhatsAppAdapter): WhatsAppProvider => {
        // Config PARCIAL = error de deploy, no un "modo mock" silencioso: en
        // prod eso significaría cero notificaciones sin que nadie lo note
        // (auditoría 2026-07-05). Todo-o-nada.
        const kapsoVars = [process.env.KAPSO_API_KEY, process.env.KAPSO_PHONE_NUMBER_ID];
        const kapsoSet = kapsoVars.filter(Boolean).length;
        if (kapsoSet === 1) {
          throw new Error(
            'Config KAPSO_* incompleta: se necesitan KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID (o ninguna).',
          );
        }
        if (kapsoSet === 2) {
          logger.log('Using KapsoWhatsAppAdapter (KAPSO_* detected)');
          return new KapsoWhatsAppAdapter();
        }
        logger.warn('KAPSO_* missing — using MockWhatsAppAdapter (no real sends)');
        return mock;
      },
      inject: [MockWhatsAppAdapter],
    },
  ],
  exports: [WHATSAPP_PROVIDER],
})
export class WhatsAppModule {}
