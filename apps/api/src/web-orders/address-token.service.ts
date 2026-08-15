import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/** Lo que tarda un cliente en elegir dirección y terminar de pedir, con aire. */
const TTL_MS = 60 * 60 * 1000; // 1h

export interface VerifiedAddress {
  formatted: string;
  lat: number;
  lng: number;
}

interface TokenPayload extends VerifiedAddress {
  exp: number;
}

/**
 * Firma las coordenadas que el SERVER resolvió para una dirección, para que
 * puedan volver en el pedido sin poder ser alteradas.
 *
 * El problema que resuelve: desde §7.v23 un domicilio fuera del radio se
 * RECHAZA. Si las coordenadas viajaran sueltas en el body, cualquiera cambia
 * un número y el candado no existe. Tampoco alcanza con re-resolver el
 * `placeId` al crear el pedido: sería una llamada paga más por pedido para
 * volver a preguntar algo que ya sabíamos.
 *
 * Entonces: el server resuelve, firma `{formatted, lat, lng, exp}` y el
 * navegador solo transporta el sobre cerrado.
 */
@Injectable()
export class AddressTokenService {
  private readonly logger = new Logger(AddressTokenService.name);
  private readonly secret: string;

  constructor() {
    const explicit = process.env.WEB_ORDER_TOKEN_SECRET;
    if (explicit && explicit.length > 0) {
      this.secret = explicit;
      return;
    }
    // Mismo criterio que WebOrderTokenService: en prod el secret propio es
    // obligatorio; el fallback existe solo para que dev arranque.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEB_ORDER_TOKEN_SECRET es obligatorio en producción (sin fallback).');
    }
    const fallback = process.env.JWT_ACCESS_SECRET;
    if (!fallback) {
      throw new Error('WEB_ORDER_TOKEN_SECRET (o JWT_ACCESS_SECRET fallback) no seteado');
    }
    this.logger.warn(
      'WEB_ORDER_TOKEN_SECRET no seteado — usando JWT_ACCESS_SECRET como fallback (solo dev)',
    );
    this.secret = fallback;
  }

  issue(address: VerifiedAddress): string {
    const payload: TokenPayload = { ...address, exp: Date.now() + TTL_MS };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${payloadB64}.${this.sign(payloadB64)}`;
  }

  /**
   * null si el token es inválido, fue alterado o venció. No lanza: el caller
   * decide qué significa (para un domicilio con el radio activo, significa
   * "no puedo verificar dónde queda" → se rechaza con un mensaje claro).
   */
  verify(token: string): VerifiedAddress | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts as [string, string];
    if (!constantTimeEq(sig, this.sign(payloadB64))) return null;

    let parsed: TokenPayload;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      return null;
    }
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.formatted !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return { formatted: parsed.formatted, lat: parsed.lat, lng: parsed.lng };
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
  }
}

function constantTimeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
