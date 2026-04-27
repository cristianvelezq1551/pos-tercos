import { Injectable, NotFoundException } from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getById(id: string): Promise<DbUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }
}
