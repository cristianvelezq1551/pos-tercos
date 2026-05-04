import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  haversineKm,
  type GeoPoint,
  type MapsProvider,
} from '@pos-tercos/domain';
import type { GeocodeResponse } from '@pos-tercos/types';
import { Public } from '../auth/decorators/public.decorator';
import { MAPS_PROVIDER } from '../adapters/maps/maps.module';

const DEFAULT_RADIUS_KM = 3;

@Controller('web/geocode')
@Public()
export class WebGeoController {
  private readonly origin: GeoPoint;
  private readonly radiusKm: number;

  constructor(@Inject(MAPS_PROVIDER) private readonly maps: MapsProvider) {
    this.origin = {
      lat: Number(process.env.RESTAURANT_LAT ?? '4.6533'),
      lng: Number(process.env.RESTAURANT_LNG ?? '-74.0836'),
    };
    this.radiusKm = Number(process.env.RESTAURANT_DELIVERY_RADIUS_KM ?? DEFAULT_RADIUS_KM);
  }

  /** FASE 8: geocode + check 3km. 30 reqs/60s/IP. */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get()
  async geocode(@Query('address') address: string): Promise<GeocodeResponse> {
    if (!address || address.trim().length < 3) {
      throw new BadRequestException('Query param `address` requerido (mínimo 3 chars).');
    }
    const result = await this.maps.geocode(address.trim());
    const distanceKm = round2(haversineKm(this.origin, result.point));
    return {
      lat: result.point.lat,
      lng: result.point.lng,
      formattedAddress: result.formattedAddress,
      accuracy: result.accuracy,
      distanceKm,
      withinDeliveryRadius: distanceKm <= this.radiusKm,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
