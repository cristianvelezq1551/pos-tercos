import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UsePipes } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDtoSchema, type LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import type { JwtAccessPayload, LoginResponse, RefreshResponse, User } from '@pos-tercos/types';

const REFRESH_COOKIE_NAME = 'pos_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { result, refresh } = await this.auth.login(body.email, body.password);
    this.setRefreshCookie(res, refresh);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!cookie) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { accessToken, refresh } = await this.auth.refresh(cookie);
    this.setRefreshCookie(res, refresh);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    await this.auth.logout(cookie);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  async me(@CurrentUser() current: JwtAccessPayload): Promise<User> {
    const dbUser = await this.users.getById(current.sub);
    return this.auth.toPublicUser(dbUser);
  }

  private setRefreshCookie(res: Response, refresh: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }
}
