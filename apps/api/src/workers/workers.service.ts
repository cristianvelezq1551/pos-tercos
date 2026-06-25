import { Injectable, NotFoundException } from '@nestjs/common';
import type { PayType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EmploymentUser } from './payroll-period';

/**
 * Datos base de empleados para nómina. El cálculo y los pagos viven en
 * WorkersWeeklyService (nómina unificada semanal); este servicio solo expone
 * los helpers compartidos (lista de empleados, nombres de actores, datos de
 * empleo) que el flujo semanal reutiliza.
 */
@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayrollUsers(): Promise<
    Array<{ id: string; fullName: string; role: string; payType: PayType | null }>
  > {
    return this.prisma.user.findMany({
      where: { payType: { not: null } },
      select: { id: true, fullName: true, role: true, payType: true },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
  }

  /** Mapa id→fullName para una lista de actor ids (filtra nulos + dedupea). */
  async fetchActorNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  async getEmploymentUser(userId: string): Promise<EmploymentUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        role: true,
        payType: true,
        salaryAmount: true,
        hireDate: true,
        terminationDate: true,
        restDaysOfWeek: true,
      },
    });
    if (!u) throw new NotFoundException(`Usuario ${userId} no encontrado`);
    return u;
  }
}
