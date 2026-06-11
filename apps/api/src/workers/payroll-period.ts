import type {
  PayrollAdjustment,
  PayrollDay,
  PayrollPayment,
} from '@pos-tercos/types';
import type { PayType, Prisma } from '@prisma/client';

/**
 * Modelo PURO de períodos de nómina + helpers de fecha + mappers DTO.
 * Sin DI ni IO — compartido por WorkersService y WorkersPaymentsService.
 */

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const DAY_MS = 86_400_000;

/** Fecha-solo YYYY-MM-DD → Date en UTC medianoche (para columnas @db.Date). */
export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function daysInclusive(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function eachDayUtc(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) out.push(new Date(t));
  return out;
}
export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}
export function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
export function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}
/** Modelo de pagos por mes: 4 sub-pagos fijos (2 quincenas × 2 partes).
 *  No son semanas Mon–Sun: el mes calendario no encaja en 4 semanas exactas,
 *  así que se fijan boundaries dentro del mes para tener siempre 4 cards y
 *  que la suma de los 4 = salario mensual.
 *    Parte 1 de Q1: días 1–7 (7 días).
 *    Parte 2 de Q1: días 8–15 (8 días).
 *    Parte 1 de Q2: días 16–22 (7 días).
 *    Parte 2 de Q2: días 23–fin (6 a 9 días según el mes). */
export interface PaymentPeriod {
  start: Date;
  end: Date;
  /** 1 = primera quincena (1–15), 2 = segunda (16–fin). */
  quincena: 1 | 2;
  /** 1 = primer sub-pago de la quincena, 2 = segundo. */
  pago: 1 | 2;
  /** Días dentro del pago. */
  daysInPago: number;
}

/** Inicios fijos de pago dentro de un mes (UTC midnight). */
export function pagoStartsOfMonth(year: number, month0: number): Date[] {
  return [
    new Date(Date.UTC(year, month0, 1)),
    new Date(Date.UTC(year, month0, 8)),
    new Date(Date.UTC(year, month0, 16)),
    new Date(Date.UTC(year, month0, 23)),
  ];
}

export function lastDayOfMonth(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0));
}

export function pagoFromStart(startDate: Date): PaymentPeriod {
  const y = startDate.getUTCFullYear();
  const m = startDate.getUTCMonth();
  const day = startDate.getUTCDate();
  const monthLast = lastDayOfMonth(y, m);
  // Mapear día de inicio → quincena/pago/end.
  if (day === 1) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 7)), quincena: 1, pago: 1, daysInPago: 7 };
  }
  if (day === 8) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 15)), quincena: 1, pago: 2, daysInPago: 8 };
  }
  if (day === 16) {
    return { start: startDate, end: new Date(Date.UTC(y, m, 22)), quincena: 2, pago: 1, daysInPago: 7 };
  }
  if (day === 23) {
    const lastDay = monthLast.getUTCDate();
    return {
      start: startDate,
      end: monthLast,
      quincena: 2,
      pago: 2,
      daysInPago: lastDay - 22,
    };
  }
  throw new Error(`Inicio de pago inválido: ${ymd(startDate)} (debe ser día 1, 8, 16 o 23).`);
}

/** Pago que contiene `probe`. */
export function paymentPeriodOf(probe: Date): PaymentPeriod {
  const y = probe.getUTCFullYear();
  const m = probe.getUTCMonth();
  const day = probe.getUTCDate();
  let startDay: 1 | 8 | 16 | 23;
  if (day <= 7) startDay = 1;
  else if (day <= 15) startDay = 8;
  else if (day <= 22) startDay = 16;
  else startDay = 23;
  return pagoFromStart(new Date(Date.UTC(y, m, startDay)));
}

export function pagoLabel(p: PaymentPeriod): string {
  const sd = p.start.getUTCDate();
  const ed = p.end.getUTCDate();
  const mShort = MONTHS_SHORT[p.start.getUTCMonth()];
  const y = p.start.getUTCFullYear();
  // "Parte 1/2 de la quincena" — evita sugerir "semana" (los bordes no
  // coinciden con lunes–domingo porque el mes calendario no encaja en
  // 4 semanas exactas; usar sub-pagos quincenales fijos siempre da 4 cards
  // y total mensual = salario).
  return `Parte ${p.pago} · ${sd}–${ed} ${mShort} ${y} · Quincena ${p.quincena}`;
}

export function quincenaLabel(year: number, month0: number, q: 1 | 2): string {
  const mShort = MONTHS_SHORT[month0];
  if (q === 1) return `Quincena 1 · 1–15 ${mShort} ${year}`;
  const last = lastDayOfMonth(year, month0).getUTCDate();
  return `Quincena 2 · 16–${last} ${mShort} ${year}`;
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

export function toDay(row: { id: string; userId: string; workDate: Date; amount: Prisma.Decimal; note: string | null; createdAt: Date }): PayrollDay {
  return {
    id: row.id,
    userId: row.userId,
    workDate: row.workDate.toISOString().slice(0, 10),
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPayment(
  row: {
    id: string;
    userId: string;
    periodStart: Date;
    status: string;
    amount: Prisma.Decimal;
    resolvedAt: Date;
    actorId: string | null;
    proofImageKey: string | null;
    note: string | null;
  },
  actorName: string | null,
): PayrollPayment {
  return {
    id: row.id,
    userId: row.userId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    status: row.status as 'PAID' | 'CANCELLED',
    amount: Number(row.amount),
    resolvedAt: row.resolvedAt.toISOString(),
    actorName,
    hasProof: row.proofImageKey !== null,
    note: row.note,
  };
}

export function toAdjustment(row: {
  id: string; userId: string; periodStart: Date; concept: string; amount: Prisma.Decimal; note: string | null; createdAt: Date;
}): PayrollAdjustment {
  return {
    id: row.id,
    userId: row.userId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    concept: row.concept,
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
