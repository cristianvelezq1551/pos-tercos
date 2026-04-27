import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessPayloadSchema } from '@pos-tercos/types';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const ACCESS_COOKIE_NAME = 'pos_access';

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
    return cookies?.[ACCESS_COOKIE_NAME];
  }
}
