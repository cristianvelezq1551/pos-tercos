import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtAccessPayload, LoginResponse, User } from '@pos-tercos/types';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const ACCESS_TOKEN_TTL = '15m';
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
    if (!user || !user.active) {
      await this.audit.log({
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email, reason: !user ? 'unknown_email' : 'inactive' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.audit.log({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email, reason: 'wrong_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signAccess(user.id, user.role, user.email);
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

    // Rotate: revoke current, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = await this.signAccess(record.user.id, record.user.role, record.user.email);
    const newRefresh = await this.issueRefreshToken(record.user.id);

    await this.audit.log({
      userId: record.user.id,
      action: 'AUTH_REFRESH',
    });

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
    availability: string | null;
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
      availability: dbUser.availability as User['availability'],
      createdAt: dbUser.createdAt.toISOString(),
    };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  private async signAccess(userId: string, role: string, email: string): Promise<string> {
    const payload: JwtAccessPayload = {
      sub: userId,
      role: role as JwtAccessPayload['role'],
      email,
    };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
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
