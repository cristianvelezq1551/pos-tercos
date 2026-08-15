import { Global, Logger, Module } from '@nestjs/common';
import { parseLatLng, type AddressProvider } from '@pos-tercos/domain';
import { BusinessConfigService } from '../../business-config/business-config.service';
import { GoogleAddressAdapter } from './google-address.adapter';
import { StubAddressAdapter } from './stub-address.adapter';

export const ADDRESS_PROVIDER = Symbol('ADDRESS_PROVIDER');

/** Coordenadas del local si no hay ninguna cargada: centro de Medellín. */
const FALLBACK_ORIGIN = { lat: 6.2442, lng: -75.5812 };

/**
 * Cuánto alrededor del local se sesga la búsqueda. Holgado a propósito: sesgar
 * no filtra, solo prioriza — quien vive a 8 km igual aparece, y la que decide
 * si entra es la validación de radio, no esto.
 */
const BIAS_RADIUS_M = 20_000;

const logger = new Logger('AddressModule');

/**
 * Selección lazy del proveedor, mismo patrón que Storage/WhatsApp:
 * `GOOGLE_MAPS_API_KEY` presente → Google Places; si no → stub determinístico
 * (dev y tests corren sin llave y sin gastar cuota).
 */
@Global()
@Module({
  providers: [
    {
      provide: ADDRESS_PROVIDER,
      useFactory: (config: BusinessConfigService): AddressProvider => {
        const origin = async (): Promise<{ lat: number; lng: number }> => {
          const cfg = await config.get();
          return parseLatLng(cfg.coords) ?? FALLBACK_ORIGIN;
        };

        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (apiKey) {
          logger.log('Direcciones por Google Places (GOOGLE_MAPS_API_KEY detectada)');
          return new GoogleAddressAdapter({
            apiKey,
            getBias: async () => ({ ...(await origin()), radiusM: BIAS_RADIUS_M }),
          });
        }
        logger.warn(
          'GOOGLE_MAPS_API_KEY ausente — direcciones por stub (sugerencias inventadas).',
        );
        return new StubAddressAdapter(origin);
      },
      inject: [BusinessConfigService],
    },
  ],
  exports: [ADDRESS_PROVIDER],
})
export class AddressModule {}
