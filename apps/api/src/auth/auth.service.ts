import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtAccessPayload, LoginResponse, User } from '@pos-tercos/types';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
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
  ) {}

  async login(email: string, password: string): Promise<{ result: LoginResponse; refresh: string }> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signAccess(user.id, user.role, user.email);
    const refresh = await this.issueRefreshToken(user.id);

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

    return { accessToken, refresh: newRefresh };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const tokenHash = this.hashRefresh(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
