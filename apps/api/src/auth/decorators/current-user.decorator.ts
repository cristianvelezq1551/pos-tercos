import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from '@pos-tercos/types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtAccessPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    return request.user;
  },
);
