import { z } from 'zod';

// ====================================================================
// WORKERS — RRHH ligero (FASE 14.B)
// ====================================================================

// --------------------------------------------------------------------
// Attendance
// --------------------------------------------------------------------

export const WorkerAttendanceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userFullName: z.string().nullable().optional(),
  userRole: z.string().nullable().optional(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime().nullable(),
  /** Horas decimales (ej. 8.5 = 8h 30min). Null si turno abierto. */
  hoursWorked: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type WorkerAttendance = z.infer<typeof WorkerAttendanceSchema>;

/** POST /workers/:userId/check-in */
export const CheckInSchema = z.object({
  /** Override del momento — útil si el dueño registra atrás. Default: now(). */
  at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type CheckIn = z.infer<typeof CheckInSchema>;

/** POST /workers/attendance/:id/check-out */
export const CheckOutSchema = z.object({
  at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type CheckOut = z.infer<typeof CheckOutSchema>;

// --------------------------------------------------------------------
// Commissions
// --------------------------------------------------------------------

export const WorkerCommissionTypeEnum = z.enum([
  'PERCENT_OF_SHIFT',
  'FIXED_PER_SALE',
]);
export type WorkerCommissionType = z.infer<typeof WorkerCommissionTypeEnum>;

export const WorkerCommissionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userFullName: z.string().nullable().optional(),
  type: WorkerCommissionTypeEnum,
  /** [0, 1). Required en PERCENT_OF_SHIFT. */
  percent: z.number().min(0).lt(1).nullable(),
  /** COP > 0. Required en FIXED_PER_SALE. */
  fixedAmount: z.number().positive().nullable(),
  appliedAt: z.string().datetime(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type WorkerCommission = z.infer<typeof WorkerCommissionSchema>;

/**
 * POST /workers/:userId/commission. Crea una NUEVA fila — el histórico
 * es inmutable; un cambio de % o monto deja la config anterior visible
 * para auditar comisiones pasadas.
 */
export const CreateCommissionSchema = z
  .object({
    type: WorkerCommissionTypeEnum,
    percent: z.number().min(0).lt(1).optional(),
    fixedAmount: z.number().positive().optional(),
    appliedAt: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT_OF_SHIFT') {
      if (data.percent === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'percent requerido para PERCENT_OF_SHIFT',
          path: ['percent'],
        });
      }
      if (data.fixedAmount !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fixedAmount no aplica para PERCENT_OF_SHIFT',
          path: ['fixedAmount'],
        });
      }
    } else {
      // FIXED_PER_SALE
      if (data.fixedAmount === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fixedAmount requerido para FIXED_PER_SALE',
          path: ['fixedAmount'],
        });
      }
      if (data.percent !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'percent no aplica para FIXED_PER_SALE',
          path: ['percent'],
        });
      }
    }
  });
export type CreateCommission = z.infer<typeof CreateCommissionSchema>;

// --------------------------------------------------------------------
// Reports
// --------------------------------------------------------------------

/** GET /workers/payroll-period?from=&to= — payroll preview por trabajador. */
export const PayrollPeriodEntrySchema = z.object({
  userId: z.string().uuid(),
  userFullName: z.string(),
  userRole: z.string(),
  totalHours: z.number().nonnegative(),
  attendanceDays: z.number().int().nonnegative(),
  /** Comisión vigente al final del período (puede ser null si no hay config). */
  activeCommission: WorkerCommissionSchema.nullable(),
  /** Total comisión calculada para los shifts del usuario en el período (solo CAJERO). */
  estimatedCommission: z.number().nonnegative(),
});
export type PayrollPeriodEntry = z.infer<typeof PayrollPeriodEntrySchema>;

export const PayrollPeriodReportSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  entries: z.array(PayrollPeriodEntrySchema),
});
export type PayrollPeriodReport = z.infer<typeof PayrollPeriodReportSchema>;
