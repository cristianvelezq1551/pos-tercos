import { z } from 'zod';
import { PayTypeEnum } from './users';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

// --- Excepción de un día (trabajador DIARIO): llegada tarde, ausencia, monto distinto ---

export const PayrollDaySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workDate: z.string(), // YYYY-MM-DD
  amount: z.number(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PayrollDay = z.infer<typeof PayrollDaySchema>;

/** Setea/edita el valor de UN día (monto 0 = ausencia; un monto < valor/día =
 *  llegada tarde, etc.). Sin excepción el día paga el valor por defecto (o 0 si
 *  es descanso del trabajador). */
export const SetPayrollDaySchema = z.object({
  workDate: DateOnly,
  amount: z.number().nonnegative(),
  note: z.string().max(300).optional(),
});
export type SetPayrollDay = z.infer<typeof SetPayrollDaySchema>;

// --- Novedad de la semana (bono, regalo, horas extra, descuento) ---

export const PayrollAdjustmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** YYYY-MM-DD = inicio de la semana de nómina a la que se ancla. */
  periodStart: z.string(),
  concept: z.string(),
  amount: z.number(), // + suma (bono) / − resta (descuento)
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PayrollAdjustment = z.infer<typeof PayrollAdjustmentSchema>;

// ====================================================================
// Nómina unificada SEMANAL — MENSUALES (salario prorrateado por día) y
// DIARIOS (valor/día) se pagan por semana con abonos parciales. La semana es
// la corrida de días laborables entre descansos (el negocio cierra los lunes;
// el descanso se corre al martes si el lunes es festivo). Cada abono pide
// comprobante; bonos/descuentos se anclan a la semana y mueven el neto.
// ====================================================================

export const PayrollWeekDayStatusEnum = z.enum(['WORKDAY', 'REST']);
export type PayrollWeekDayStatus = z.infer<typeof PayrollWeekDayStatusEnum>;

/** Un día de la semana de nómina, ya valorizado y con su estado de pago. */
export const WeeklyPayrollDaySchema = z.object({
  date: DateOnly,
  /** 0=domingo … 6=sábado. */
  weekday: z.number().int().min(0).max(6),
  isHoliday: z.boolean(),
  status: PayrollWeekDayStatusEnum,
  /** Monto a pagar ese día (override gana; si no, valor/día en laborable; 0 en descanso). */
  amount: z.number(),
  /** true si hay una excepción manual (PayrollDay) para ese día. */
  hasOverride: z.boolean(),
  /** true si el día ya fue cubierto por un abono PAID. */
  isPaid: z.boolean(),
  /** true si el día aún no llega (no se puede pagar a futuro). */
  isFuture: z.boolean(),
});
export type WeeklyPayrollDay = z.infer<typeof WeeklyPayrollDaySchema>;

/** Un abono semanal registrado (con comprobante). El pago puede ser efectivo,
 *  cuenta o mixto: `cashAmount` + `bankAmount` = `amount`. */
export const PayrollWeekPaymentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  weekStart: DateOnly,
  paidDays: z.array(DateOnly),
  amount: z.number().nonnegative(),
  cashAmount: z.number().nonnegative(),
  bankAmount: z.number().nonnegative(),
  status: z.enum(['PAID', 'VOIDED']),
  hasProof: z.boolean(),
  /** Cuántos comprobantes hay (un abono puede llevar varios). Opcional: la API
   *  y el admin se despliegan por separado (cae a `hasProof ? 1 : 0`). */
  proofsCount: z.number().int().nonnegative().optional(),
  note: z.string().nullable(),
  paidAt: z.string().datetime(),
  actorName: z.string().nullable(),
});
export type PayrollWeekPayment = z.infer<typeof PayrollWeekPaymentSchema>;

/** Un empleado (DIARIO o MENSUAL) dentro de la semana de nómina unificada. */
export const WeeklyPayrollEntrySchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  role: z.string(),
  /** MENSUAL (salario/30 por día) o DIARIO (valor/día). */
  payType: PayTypeEnum,
  /** Salario configurado (MENSUAL: mensual; DIARIO: valor/día). Para editarlo. */
  salaryAmount: z.number().nullable(),
  /** Fecha de ingreso (ISO) — para el diálogo de salario. */
  hireDate: z.string().datetime().nullable(),
  /** Fecha de terminación de empleo (ISO), si el contrato terminó. */
  terminationDate: z.string().datetime().nullable(),
  /** Días de descanso del trabajador (0=domingo … 6=sábado). DIARIO no paga
   *  esos días; sirve para los part-time que no trabajan toda la semana. */
  restDaysOfWeek: z.array(z.number().int().min(0).max(6)),
  /** DIARIO: valor por día. MENSUAL: salario ÷ 30 (tarifa diaria prorrateada). */
  valuePerDay: z.number(),
  days: z.array(WeeklyPayrollDaySchema),
  /** Σ de los días de la semana (DIARIO: laborables/override; MENSUAL: salario/30 × días empleados). */
  owedTotal: z.number(),
  /** Bonos (+) / descuentos (−) anclados a esta semana. */
  adjustments: z.array(PayrollAdjustmentSchema),
  /** Σ firmada de los ajustes. */
  adjustmentsTotal: z.number(),
  /** owedTotal + adjustmentsTotal = lo que se debe NETO por la semana. */
  netOwed: z.number(),
  /** Σ de abonos PAID de la semana (dinero realmente pagado). */
  paidTotal: z.number(),
  /** netOwed − paidTotal (lo que falta abonar). */
  remaining: z.number(),
  /** Días ya cubiertos por algún abono (YYYY-MM-DD) — etiqueta de cobertura. */
  paidDays: z.array(DateOnly),
  payments: z.array(PayrollWeekPaymentSchema),
});
export type WeeklyPayrollEntry = z.infer<typeof WeeklyPayrollEntrySchema>;

/** Agregar un bono/descuento a la semana de un empleado. */
export const AddWeeklyAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  weekStart: DateOnly,
  concept: z.string().min(1).max(120),
  amount: z.number().refine((v) => v !== 0, 'El monto no puede ser 0'),
  note: z.string().max(300).optional(),
});
export type AddWeeklyAdjustment = z.infer<typeof AddWeeklyAdjustmentSchema>;

export const WeeklyPayrollReportSchema = z.object({
  weekStart: DateOnly,
  weekEnd: DateOnly,
  weekLabel: z.string(),
  /** Refs para navegar a la semana anterior/siguiente (YYYY-MM-DD). */
  prevRef: DateOnly,
  nextRef: DateOnly,
  entries: z.array(WeeklyPayrollEntrySchema),
});
export type WeeklyPayrollReport = z.infer<typeof WeeklyPayrollReportSchema>;

/** Input para registrar un abono semanal (el comprobante va aparte, multipart).
 *  El pago se reparte por bolsillo: `cashAmount` (efectivo) + `bankAmount`
 *  (cuenta) deben sumar el total de los días seleccionados (lo valida el
 *  backend). Para pago simple, uno de los dos va en 0. */
export const PayWeekDaysSchema = z.object({
  userId: z.string().uuid(),
  weekStart: DateOnly,
  /** Días que cubre el abono (etiqueta de cobertura). El monto real lo dan
   *  cashAmount+bankAmount; el backend valida que no supere el restante neto. */
  days: z.array(DateOnly).default([]),
  cashAmount: z.number().nonnegative(),
  bankAmount: z.number().nonnegative(),
  note: z.string().max(300).optional(),
}).refine((v) => v.cashAmount + v.bankAmount > 0, {
  message: 'El pago no puede ser 0',
  path: ['cashAmount'],
});
export type PayWeekDays = z.infer<typeof PayWeekDaysSchema>;
