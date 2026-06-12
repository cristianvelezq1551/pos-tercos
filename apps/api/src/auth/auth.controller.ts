import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UsePipes } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDtoSchema, type LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import type { JwtAccessPayload, LoginResponse, RefreshResponse, User } from '@pos-tercos/types';

const ACCESS_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cookies por app. En dev admin y pos comparten host (localhost, distinto puerto)
 * y las cookies se aíslan por hostname — no por puerto. Nombres distintos evitan
 * que una sesión de cajero pise/active la de admin y viceversa. El frontend
 * declara su app con el header `X-Client-App`. Default `pos` por compatibilidad.
 */
type ClientApp = 'admin' | 'pos';

const COOKIE_NAMES: Record<ClientApp, { access: string; refresh: string }> = {
  admin: { access: 'admin_access', refresh: 'admin_refresh' },
  pos: { access: 'pos_access', refresh: 'pos_refresh' },
};

function resolveApp(req: Request): ClientApp {
  const header = req.headers['x-client-app'];
  const value = Array.isArray(header) ? header[0] : header;
  return value === 'admin' ? 'admin' : 'pos';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(LoginDtoSchema))
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { result, refresh } = await this.auth.login(body.email, body.password);
    this.setAuthCookies(res, resolveApp(req), result.accessToken, refresh);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const app = resolveApp(req);
    const cookie = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAMES[app].refresh];
    if (!cookie) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { accessToken, refresh } = await this.auth.refresh(cookie);
    this.setAuthCookies(res, app, accessToken, refresh);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const app = resolveApp(req);
    const cookie = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAMES[app].refresh];
    await this.auth.logout(cookie);
    this.clearAuthCookies(res, app);
  }

  /** Token fresco para reconectar sockets (ver AuthService.mintWsToken). */
  @Get('ws-token')
  wsToken(@CurrentUser() current: JwtAccessPayload): Promise<{ token: string }> {
    return this.auth.mintWsToken(current);
  }

  @Get('me')
  async me(@CurrentUser() current: JwtAccessPayload): Promise<User> {
    const dbUser = await this.users.getById(current.sub);
    return this.auth.toPublicUser(dbUser);
  }

  private setAuthCookies(
    res: Response,
    app: ClientApp,
    accessToken: string,
    refresh: string,
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const names = COOKIE_NAMES[app];
    res.cookie(names.access, accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    res.cookie(names.refresh, refresh, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response, app: ClientApp): void {
    const names = COOKIE_NAMES[app];
    res.clearCookie(names.access, { path: '/' });
    res.clearCookie(names.refresh, { path: '/' });
  }
}
