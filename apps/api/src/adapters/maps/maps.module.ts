import { Global, Logger, Module } from '@nestjs/common';
import { MapboxMapsAdapter } from './mapbox.adapter';
import { MockMapsAdapter } from './mock.adapter';

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');

/**
 * Maps adapter módulo. Auto-fallback:
 *  - Si MAPBOX_SECRET_TOKEN está seteado → MapboxMapsAdapter (real).
 *  - Si NO está → MockMapsAdapter (determinístico, sin red).
 *
 * Esto permite correr tests/CI sin secretos. En dev/prod se setea el token.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAPS_PROVIDER,
      useFactory: () => {
        const logger = new Logger('MapsModule');
        if (process.env.MAPBOX_SECRET_TOKEN) {
          logger.log('Using MapboxMapsAdapter (token detected)');
          return new MapboxMapsAdapter();
        }
        logger.warn('MAPBOX_SECRET_TOKEN missing — falling back to MockMapsAdapter');
        return new MockMapsAdapter();
      },
    },
  ],
  exports: [MAPS_PROVIDER],
})
export class MapsModule {}
