import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessPayloadSchema } from '@pos-tercos/types';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Admin y pos usan cookies de access distintas (ver auth.controller). En dev
// comparten host (localhost — las cookies NO distinguen puerto), así que un
// request puede traer AMBAS. Regla estricta: si viene `X-Client-App`, SOLO se
// acepta la cookie de ESA app (los middlewares de admin/pos lo inyectan en
// todo /api/*). El fallback a ambas queda solo para llamadas sin header
// (curl/clientes legacy) — nunca para los frontends.
const ACCESS_COOKIE_BY_APP: Record<string, string> = {
  admin: 'admin_access',
  pos: 'pos_access',
};
const ACCESS_COOKIE_NAMES = ['pos_access', 'admin_access'] as const;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      const payload = JwtAccessPayloadSchema.parse(decoded);
      (req as Request & { user: typeof payload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header) {
      const [type, value] = header.split(' ');
      if (type === 'Bearer' && value) return value;
    }
    const cookies = req.cookies as Record<string, string> | undefined;
    if (!cookies) return undefined;
    // Con X-Client-App: SOLO la cookie de esa app (aislamiento de sesiones).
    const appHeader = req.headers['x-client-app'];
    const app = Array.isArray(appHeader) ? appHeader[0] : appHeader;
    if (app && ACCESS_COOKIE_BY_APP[app]) {
      return cookies[ACCESS_COOKIE_BY_APP[app]];
    }
    for (const name of ACCESS_COOKIE_NAMES) {
      if (cookies[name]) return cookies[name];
    }
    return undefined;
  }
}
