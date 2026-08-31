import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UsePipes } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { isProd } from '../common/assert-env';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDtoSchema, type LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import type { JwtAccessPayload, LoginResponse, RefreshResponse, User } from '@pos-tercos/types';

const ACCESS_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cookies por app. En dev las apps comparten host (localhost, distinto puerto)
 * y las cookies se aíslan por hostname — no por puerto. Nombres distintos evitan
 * que una sesión pise/active la de otra app. El frontend declara su app con el
 * header `X-Client-App`.
 *
 * `pos` es LEGACY del cutover POS→admin (§7.v10+): ninguna app viva lo declara
 * (la caja corre dentro del admin), pero se honra si llega explícito. El
 * default sin header es `admin` — antes era `pos` y un login sin header emitía
 * cookies `pos_*` que ninguna app reenviaba (sesión fantasma).
 */
type ClientApp = 'admin' | 'pos' | 'cocina';

const COOKIE_NAMES: Record<ClientApp, { access: string; refresh: string }> = {
  admin: { access: 'admin_access', refresh: 'admin_refresh' },
  pos: { access: 'pos_access', refresh: 'pos_refresh' },
  cocina: { access: 'cocina_access', refresh: 'cocina_refresh' },
};

function resolveApp(req: Request): ClientApp {
  const header = req.headers['x-client-app'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === 'pos') return 'pos';
  if (value === 'cocina') return 'cocina';
  return 'admin';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // anti-brute-force de contraseña
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

  /** Permiso corto para subir un archivo grande DIRECTO al API (ver el service). */
  @Get('upload-ticket')
  uploadTicket(@CurrentUser() current: JwtAccessPayload): Promise<{ token: string }> {
    return this.auth.mintUploadTicket(current);
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
    const secure = isProd();
    const names = COOKIE_NAMES[app];
    res.cookie(names.access, accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    res.cookie(names.refresh, refresh, {
      httpOnly: true,
      secure,
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
