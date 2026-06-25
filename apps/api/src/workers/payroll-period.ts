import type { PayType, Prisma } from '@prisma/client';

/**
 * Helpers de fecha + tipo de empleo para la nómina SEMANAL unificada.
 * Sin DI ni IO — compartido por WorkersService y WorkersWeeklyService.
 */

/** Fecha-solo YYYY-MM-DD → Date en UTC medianoche (para columnas @db.Date). */
export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

export type EmploymentUser = {
  id: string;
  fullName: string;
  role: string;
  payType: PayType | null;
  salaryAmount: Prisma.Decimal | null;
  hireDate: Date | null;
  terminationDate: Date | null;
  restDaysOfWeek: number[];
};
