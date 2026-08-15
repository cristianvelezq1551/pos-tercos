import { Body, Controller, Get, Inject, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Post } from '@nestjs/common';
import type { AddressProvider } from '@pos-tercos/domain';
import {
  ResolveAddressSchema,
  type AddressSuggestResponse,
  type ResolveAddress,
  type ResolvedAddressResponse,
} from '@pos-tercos/types';
import { ADDRESS_PROVIDER } from '../adapters/address/address.module';
import { Public } from '../auth/decorators/public.decorator';
import { BusinessConfigService } from '../business-config/business-config.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AddressTokenService } from './address-token.service';

/**
 * Autocompletado de direcciones para el checkout.
 *
 * Va por acá y no directo desde el navegador porque la llave de Google es de
 * facturación: publicarla es dejar que un tercero gaste la cuota. El throttle
 * es la otra mitad — el endpoint es público y cada búsqueda cuesta plata.
 */
@Controller('web/address')
@Public()
export class AddressController {
  constructor(
    @Inject(ADDRESS_PROVIDER) private readonly addresses: AddressProvider,
    private readonly tokens: AddressTokenService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  /**
   * 40/min por IP: alcanza para escribir una dirección con comodidad (el
   * cliente hace debounce) y corta un script que quiera vaciar la cuota.
   */
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @Get('suggest')
  async suggest(
    @Query('q') q?: string,
    @Query('session') session?: string,
  ): Promise<AddressSuggestResponse> {
    if (!q || q.trim().length < 4) return { suggestions: [] };
    // Tope de longitud: cada búsqueda va a un provider PAGO. Una dirección
    // real no pasa de ~120 caracteres; el session token de Google es corto.
    const query = q.trim().slice(0, 200);
    const sess =
      typeof session === 'string' && /^[\w.-]{1,128}$/.test(session) ? session : undefined;
    return { suggestions: await this.addresses.suggest(query, sess) };
  }

  /**
   * Canjea la sugerencia elegida por coordenadas + veredicto de cobertura, y
   * firma el resultado. Lo que devuelve es la ÚNICA fuente válida de la
   * ubicación de entrega: el pedido no acepta lat/lng sueltos.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('resolve')
  async resolve(
    @Body(new ZodValidationPipe(ResolveAddressSchema)) body: ResolveAddress,
  ): Promise<ResolvedAddressResponse> {
    const resolved = await this.addresses.resolve(body.suggestionId, body.sessionToken);
    if (!resolved) {
      // Sin coordenadas no hay nada que firmar ni que medir. Se responde con
      // radio y `inRange:false` para que la web muestre "elegí otra".
      const cfg = await this.businessConfig.get();
      return {
        formatted: '',
        lat: 0,
        lng: 0,
        precision: 'approximate',
        inRange: false,
        distanceKm: null,
        radiusKm: cfg.orderRadiusKm,
        addressToken: '',
      };
    }

    const { inRange, distanceKm, radiusKm } = await this.businessConfig.checkRadius({
      lat: resolved.lat,
      lng: resolved.lng,
    });

    return {
      ...resolved,
      inRange,
      distanceKm,
      radiusKm,
      addressToken: this.tokens.issue({
        formatted: resolved.formatted,
        lat: resolved.lat,
        lng: resolved.lng,
      }),
    };
  }
}
