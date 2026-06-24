import { z } from 'zod';
import { PayTypeEnum } from './users';

// ====================================================================
// Nómina v5 — pago mensual o diario, liquidación por PAGOS: 2 quincenas
// × 2 sub-pagos = 4 pagos fijos por mes. Cero cards "fantasma" del
// calendario; cada pago vive dentro de su mes.
//
//   Pago 1 de Q1: días 1–7
//   Pago 2 de Q1: días 8–15
//   Pago 1 de Q2: días 16–22
//   Pago 2 de Q2: días 23–fin del mes
// ====================================================================

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

// --- Día de pago (trabajador DIARIO) ---

export const PayrollDaySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workDate: z.string(), // YYYY-MM-DD
  amount: z.number(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PayrollDay = z.infer<typeof PayrollDaySchema>;

/** EXCEPCIÓN de un día: monto 0 = no asistió, o un monto distinto al valor/día.
 *  Sin excepción el día paga el valor por defecto (o 0 si es descanso cíclico). */
export const SetPayrollDaySchema = z.object({
  workDate: DateOnly,
  amount: z.number().nonnegative(),
  note: z.string().max(300).optional(),
});
export type SetPayrollDay = z.infer<typeof SetPayrollDaySchema>;

// --- Novedad de PAGO (bono, regalo, horas extra, descuento) ---

export const PayrollAdjustmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** YYYY-MM-DD = inicio del pago (uno de {día 1, 8, 16, 23} del mes). */
  periodStart: z.string(),
  concept: z.string(),
  amount: z.number(), // + suma (bono) / − resta (descuento)
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PayrollAdjustment = z.infer<typeof PayrollAdjustmentSchema>;

export const AddPayrollAdjustmentSchema = z.object({
  /** Cualquier día del pago al que se agrega; el backend lo ancla al inicio. */
  periodStart: DateOnly,
  concept: z.string().min(1).max(120),
  amount: z.number().refine((v) => v !== 0, 'El monto no puede ser 0'),
  note: z.string().max(300).optional(),
});
export type AddPayrollAdjustment = z.infer<typeof AddPayrollAdjustmentSchema>;

// --- Control de pago (marcar pagado/cancelado con comprobante; solo Dueño) ---

export const PayrollPaymentStatusEnum = z.enum(['PAID', 'CANCELLED']);
export type PayrollPaymentStatus = z.infer<typeof PayrollPaymentStatusEnum>;

export const PayrollPaymentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  periodStart: z.string(),
  status: PayrollPaymentStatusEnum,
  /** Snapshot del total al momento de marcar (sin auto-update). */
  amount: z.number().nonnegative(),
  resolvedAt: z.string().datetime(),
  actorName: z.string().nullable(),
  /** True si hay imagen de comprobante (siempre true para PAID). */
  hasProof: z.boolean(),
  note: z.string().nullable(),
});
export type PayrollPayment = z.infer<typeof PayrollPaymentSchema>;

// --- Pago (lista para pagar este pago a TODOS los empleados) ---

export const PagoEntrySchema = z.object({
  userId: z.string().uuid(),
  userFullName: z.string(),
  userRole: z.string(),
  payType: PayTypeEnum.nullable(),
  salaryAmount: z.number().nullable(),
  hireDate: z.string().datetime().nullable(),
  terminationDate: z.string().datetime().nullable(),
  /** Días calendario empleado dentro del pago (para proración mensual). */
  daysEmployed: z.number().int().nonnegative(),
  /** Días con pago registrado (DAILY: excluye descansos cíclicos). */
  daysWorked: z.number().int().nonnegative(),
  /** Base del pago. MONTHLY = salario/4 (prorrateado por días empleados);
   *  DAILY = suma de días no-descanso (con overrides). */
  base: z.number(),
  adjustmentsTotal: z.number(),
  total: z.number(),
  /** Reparto SUGERIDO de propinas del período (proporcional a días
   *  trabajados). Es efectivo aparte — NO suma al total a pagar. */
  tipsShare: z.number(),
  /** Marca de PAGADO/CANCELADO (con comprobante), si existe. */
  payment: PayrollPaymentSchema.nullable(),
});
export type PagoEntry = z.infer<typeof PagoEntrySchema>;

export const PagoReportSchema = z.object({
  periodStart: z.string(),   // inicio del pago (día 1/8/16/23 del mes)
  periodEnd: z.string(),     // último día del pago
  periodLabel: z.string(),   // "Pago 2 · 8–15 jun 2026 · Q1"
  /** 1 = Quincena 1 (días 1–15); 2 = Quincena 2 (días 16–fin). */
  quincena: z.number().int().min(1).max(2),
  /** 1 = primer sub-pago de la quincena; 2 = segundo. */
  pago: z.number().int().min(1).max(2),
  entries: z.array(PagoEntrySchema),
  totalPay: z.number(),
  /** Propinas recaudadas en el período (suma de cierres de caja). */
  tipsTotal: z.number(),
});
export type PagoReport = z.infer<typeof PagoReportSchema>;

// --- Día del mes ya calculado (modalidad DIARIA) ---

export const PanelDaySchema = z.object({
  workDate: z.string(), // YYYY-MM-DD
  amount: z.number(),
  isDefault: z.boolean(),
  isAbsence: z.boolean(),
  /** true = día de descanso cíclico (DOW ∈ user.restDaysOfWeek). */
  isRest: z.boolean(),
  isFuture: z.boolean(),
  note: z.string().nullable(),
  overrideId: z.string().uuid().nullable(),
});
export type PanelDay = z.infer<typeof PanelDaySchema>;

// --- Panel mensual por empleado: 2 quincenas × 2 pagos = 4 pagos siempre ---

export const PanelPagoSchema = z.object({
  periodStart: z.string(),   // YYYY-MM-DD
  periodEnd: z.string(),
  /** "Parte 1 · 1–7 jun 2026 · Quincena 1" — NO son semanas Mon-Sun;
   *  son sub-pagos quincenales fijos (4 por mes, total = salario). */
  label: z.string(),
  /** 1 = primera parte de la quincena; 2 = segunda. */
  pago: z.number().int().min(1).max(2),
  base: z.number(),
  daysEmployed: z.number().int().nonnegative(),
  daysWorked: z.number().int().nonnegative(),
  adjustments: z.array(PayrollAdjustmentSchema),
  adjustmentsTotal: z.number(),
  total: z.number(),
  /** Marca de PAGADO/CANCELADO (con comprobante), si existe. */
  payment: PayrollPaymentSchema.nullable(),
});
export type PanelPago = z.infer<typeof PanelPagoSchema>;

export const PanelQuincenaSchema = z.object({
  /** 1 (días 1–15) o 2 (días 16–fin). */
  quincena: z.number().int().min(1).max(2),
  /** "Quincena 1 · 1–15 jun" */
  label: z.string(),
  /** Exactamente 2 sub-pagos en orden. */
  pagos: z.tuple([PanelPagoSchema, PanelPagoSchema]),
  subtotal: z.number(),
});
export type PanelQuincena = z.infer<typeof PanelQuincenaSchema>;

export const EmployeePanelSchema = z.object({
  userId: z.string().uuid(),
  userFullName: z.string(),
  userRole: z.string(),
  payType: PayTypeEnum.nullable(),
  salaryAmount: z.number().nullable(),
  hireDate: z.string().datetime().nullable(),
  terminationDate: z.string().datetime().nullable(),
  /** Días de descanso cíclicos del trabajador (0=domingo … 6=sábado). */
  restDaysOfWeek: z.array(z.number().int().min(0).max(6)),
  year: z.number().int(),
  month: z.number().int(),
  monthLabel: z.string(),
  /** Exactamente 2 quincenas; cada una con 2 pagos. */
  quincenas: z.tuple([PanelQuincenaSchema, PanelQuincenaSchema]),
  /** Calendario de días del mes (solo modalidad diaria). */
  days: z.array(PanelDaySchema),
  monthTotal: z.number(),
});
export type EmployeePanel = z.infer<typeof EmployeePanelSchema>;

// ====================================================================
// Nómina v6 — pago SEMANAL para empleados DIARIO con abonos parciales por
// días seleccionados. La semana es lunes–domingo; el día de descanso se corre
// si cae en festivo (el negocio abre y se paga). Cada abono pide comprobante.
// Los MENSUALES siguen con el modelo quincenal de arriba.
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
