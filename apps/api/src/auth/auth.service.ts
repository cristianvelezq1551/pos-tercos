import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtAccessPayload, LoginResponse, User } from '@pos-tercos/types';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const ACCESS_TOKEN_TTL = '24h';
/**
 * El token de WS vive en JavaScript (la cookie httpOnly no viaja al handshake),
 * así que es lo único que un XSS puede robar — por eso dura minutos, no horas.
 * 120s alcanza de sobra para SSR → hidratación → connect; si igual venciera,
 * `keepSocketAuthFresh` pide uno nuevo en `connect_error` y el socket se cura solo.
 */
const WS_TOKEN_TTL = '120s';
/** Lo justo para empezar la subida. Una canción grande tarda; el permiso
 *  solo tiene que estar vivo cuando arranca la petición. */
const UPLOAD_TICKET_TTL = '2m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const REFRESH_TOKEN_BYTES = 48;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string): Promise<{ result: LoginResponse; refresh: string }> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.audit.log({
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email, reason: 'unknown_email' },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.audit.log({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email, reason: 'wrong_password' },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Credenciales correctas pero usuario desactivado → mensaje claro (no
    // "credenciales inválidas", que confunde a un empleado dado de baja).
    if (!user.active) {
      await this.audit.log({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email, reason: 'inactive' },
      });
      throw new ForbiddenException('Tu usuario está inactivo. Contacta al administrador.');
    }

    const accessToken = await this.signAccess(user.id, user.role, user.email, user.tokenVersion);
    const refresh = await this.issueRefreshToken(user.id);

    await this.audit.log({
      userId: user.id,
      action: 'AUTH_LOGIN',
      metadata: { role: user.role },
    });

    return {
      result: {
        accessToken,
        user: this.toPublicUser(user),
      },
      refresh,
    };
  }

  async refresh(rawRefresh: string): Promise<{ accessToken: string; refresh: string }> {
    const tokenHash = this.hashRefresh(rawRefresh);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      await this.audit.log({
        userId: record?.userId ?? null,
        action: 'AUTH_REFRESH_FAILED',
        metadata: {
          reason: !record ? 'unknown_token' : record.revokedAt ? 'revoked' : 'expired',
        },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!record.user.active) {
      throw new UnauthorizedException('User inactive');
    }

    // Rotate: revoca el token actual de forma ATÓMICA y emite un par nuevo SOLO
    // si este revoke ganó. Sin la condición `revokedAt: null`, dos refresh
    // concurrentes con el mismo token (doble pestaña / retry de red del
    // SessionKeeper) emitían DOS pares válidos de un solo token → rompía la
    // rotación. Ahora el perdedor recibe 401 (el token ya se consumió).
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) {
      await this.audit.log({
        userId: record.userId,
        action: 'AUTH_REFRESH_FAILED',
        metadata: { reason: 'already_rotated' },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = await this.signAccess(record.user.id, record.user.role, record.user.email, record.user.tokenVersion);
    const newRefresh = await this.issueRefreshToken(record.user.id);

    // No se audita el refresh exitoso: pasa cada pocas horas por sesión y solo
    // hace ruido en la bitácora. Los fallos (AUTH_REFRESH_FAILED) sí se registran.

    return { accessToken, refresh: newRefresh };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const tokenHash = this.hashRefresh(rawRefresh);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (record) {
      await this.audit.log({
        userId: record.userId,
        action: 'AUTH_LOGOUT',
      });
    }
  }

  toPublicUser(dbUser: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    mustChangePwd: boolean;
    active: boolean;
    createdAt: Date;
  }): User {
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      phone: dbUser.phone,
      role: dbUser.role as User['role'],
      mustChangePwd: dbUser.mustChangePwd,
      active: dbUser.active,
      createdAt: dbUser.createdAt.toISOString(),
    };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  /**
   * Token fresco para el handshake de WebSocket. El navegador no puede leer
   * la cookie httpOnly, así que los sockets reciben el JWT por handshake; al
   * reconectar después de horas el token original puede haber vencido — este
   * endpoint emite uno nuevo a partir de la sesión (cookie) vigente.
   *
   * NO devuelve el access token: emite uno con `scope: 'ws'` y 120s de vida,
   * que el `JwtAuthGuard` rechaza. Antes acá se reemitía el access de 24h tal
   * cual, así que un XSS en la caja se llevaba una credencial completa de la
   * API — justo lo que la cookie httpOnly existe para evitar.
   */
  async mintWsToken(current: JwtAccessPayload): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: current.sub },
      select: { id: true, role: true, email: true, active: true, tokenVersion: true },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }
    return { token: await this.signWs(user.id, user.role, user.email, user.tokenVersion) };
  }

  /**
   * Permiso para subir UN archivo grande directo al API.
   *
   * El navegador no puede mandar un archivo pesado por el proxy de la app (que
   * corta el cuerpo cerca de 4,5 MB) ni usar la cookie httpOnly contra otro
   * origen. Este permiso dura lo justo para la subida y solo abre las rutas
   * marcadas con `@AllowUploadTicket()`: robado, no sirve para nada más.
   */
  async mintUploadTicket(current: JwtAccessPayload): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: current.sub },
      select: { id: true, role: true, email: true, active: true, tokenVersion: true },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }
    const payload: JwtAccessPayload = {
      sub: user.id,
      role: user.role as JwtAccessPayload['role'],
      email: user.email,
      tv: user.tokenVersion,
      scope: 'upload',
    };
    return {
      token: await this.jwt.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: UPLOAD_TICKET_TTL,
      }),
    };
  }

  private async signAccess(
    userId: string,
    role: string,
    email: string,
    tokenVersion: number,
  ): Promise<string> {
    const payload: JwtAccessPayload = {
      sub: userId,
      role: role as JwtAccessPayload['role'],
      email,
      tv: tokenVersion,
    };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  /** Credencial de un solo uso para el handshake WS. Ver `mintWsToken`. */
  private async signWs(
    userId: string,
    role: string,
    email: string,
    tokenVersion: number,
  ): Promise<string> {
    const payload: JwtAccessPayload = {
      sub: userId,
      role: role as JwtAccessPayload['role'],
      email,
      tv: tokenVersion,
      scope: 'ws',
    };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: WS_TOKEN_TTL,
    });
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hashRefresh(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return raw;
  }

  private hashRefresh(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
