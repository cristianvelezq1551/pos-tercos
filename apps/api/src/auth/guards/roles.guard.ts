import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload, UserRole } from '@pos-tercos/types';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtAccessPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('No authenticated user in request');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} is not allowed for this resource`);
    }
    return true;
  }
}
