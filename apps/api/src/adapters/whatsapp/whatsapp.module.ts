import { Global, Logger, Module } from '@nestjs/common';
import type { WhatsAppProvider } from '@pos-tercos/domain';
import { MockWhatsAppAdapter } from './mock.adapter';
import { OpenWaWhatsAppAdapter } from './openwa.adapter';

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

/**
 * Selección lazy del adapter. Si OPENWA_URL + OPENWA_API_KEY +
 * OPENWA_SESSION_ID están seteados → OpenWaWhatsAppAdapter (real). Si no
 * → MockWhatsAppAdapter (dev, solo loggea). Mismo patrón que StorageModule:
 * el adapter real se instancia a mano en el factory para que dev funcione
 * sin ninguna variable de OpenWA.
 */
const logger = new Logger('WhatsAppModule');

@Global()
@Module({
  providers: [
    MockWhatsAppAdapter,
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (mock: MockWhatsAppAdapter): WhatsAppProvider => {
        if (
          process.env.OPENWA_URL &&
          process.env.OPENWA_API_KEY &&
          process.env.OPENWA_SESSION_ID
        ) {
          logger.log('Using OpenWaWhatsAppAdapter (OPENWA_* detected)');
          return new OpenWaWhatsAppAdapter();
        }
        logger.warn('OPENWA_* missing — using MockWhatsAppAdapter (no real sends)');
        return mock;
      },
      inject: [MockWhatsAppAdapter],
    },
  ],
  exports: [WHATSAPP_PROVIDER],
})
export class WhatsAppModule {}
