import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface TokenPayload {
  sid: string; // saleId
  exp: number; // ms epoch
}

/**
 * Token HMAC para tracking público de órdenes web. Formato:
 *   <base64url(payload)>.<base64url(sig)>
 *
 * - 24h de validez desde issue.
 * - Secret tomado de env `WEB_ORDER_TOKEN_SECRET`. Si no está, usa
 *   `JWT_ACCESS_SECRET` como fallback en dev (warn al startup).
 * - Verificación timing-safe.
 */
@Injectable()
export class WebOrderTokenService {
  private readonly logger = new Logger(WebOrderTokenService.name);
  private readonly secret: string;

  constructor() {
    const explicit = process.env.WEB_ORDER_TOKEN_SECRET;
    if (explicit && explicit.length > 0) {
      this.secret = explicit;
    } else {
      // En PROD el secret propio es OBLIGATORIO: caer a JWT_ACCESS_SECRET acopla
      // dos dominios de firma (sesión vs token público) — si uno se filtra, caen
      // ambos. El fallback solo se permite en dev. (assertRequiredEnv ya lo exige
      // al arranque; este throw es la defensa redundante en el propio servicio.)
      if (process.env.NODE_ENV === 'production') {
        throw new Error('WEB_ORDER_TOKEN_SECRET es obligatorio en producción (sin fallback).');
      }
      const fallback = process.env.JWT_ACCESS_SECRET;
      if (!fallback) {
        throw new Error(
          'WEB_ORDER_TOKEN_SECRET (o JWT_ACCESS_SECRET fallback) no seteado',
        );
      }
      this.logger.warn(
        'WEB_ORDER_TOKEN_SECRET no seteado — usando JWT_ACCESS_SECRET como fallback (solo dev)',
      );
      this.secret = fallback;
    }
  }

  issue(saleId: string): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + TTL_MS);
    const payload: TokenPayload = { sid: saleId, exp: expiresAt.getTime() };
    const payloadB64 = b64url(JSON.stringify(payload));
    const sig = this.sign(payloadB64);
    return { token: `${payloadB64}.${sig}`, expiresAt };
  }

  /**
   * Verifica el token y retorna el saleId. Throws UnauthorizedException si:
   *  - formato inválido
   *  - firma no matchea (timing-safe)
   *  - expirado
   *  - saleId del path no matchea con el del token
   */
  verify(token: string, expectedSaleId: string): void {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('token malformed');
    }
    const [payloadB64, sig] = parts as [string, string];
    const expected = this.sign(payloadB64);
    if (!constantTimeStringEq(sig, expected)) {
      throw new UnauthorizedException('token signature invalid');
    }
    let parsed: TokenPayload;
    try {
      parsed = JSON.parse(fromB64url(payloadB64)) as TokenPayload;
    } catch {
      throw new UnauthorizedException('token payload invalid');
    }
    if (typeof parsed.sid !== 'string' || typeof parsed.exp !== 'number') {
      throw new UnauthorizedException('token payload shape invalid');
    }
    if (parsed.sid !== expectedSaleId) {
      throw new UnauthorizedException('token does not match this order');
    }
    if (Date.now() > parsed.exp) {
      throw new UnauthorizedException('token expired');
    }
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
  }
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}
function fromB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function constantTimeStringEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
