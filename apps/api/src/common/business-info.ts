import { businessName } from './business-name';

/**
 * Datos del negocio que van impresos en cualquier papel que salga del local.
 *
 * Estaban leídos a mano en el mapper de ventas; el recibo de una cortesía los
 * necesita igual, y dos copias de estos cuatro `process.env` terminan diciendo
 * cosas distintas en dos papeles del mismo mostrador.
 */
export function businessInfo(): {
  name: string;
  address: string;
  nit: string;
  phone: string | null;
} {
  return {
    name: businessName(),
    address: process.env.BUSINESS_ADDRESS ?? 'Dirección por configurar',
    nit: process.env.BUSINESS_NIT ?? '900.000.000-0',
    phone: process.env.BUSINESS_PHONE ?? null,
  };
}
