import { z } from 'zod';
import { UserRoleEnum, UserSchema } from './auth';

// bcrypt trunca contraseñas a 72 bytes — capamos para evitar sorpresas.
const PASSWORD_MAX = 72;

/** Modalidad de pago. MONTHLY = salario fijo al mes; DAILY = valor fijo al día. */
export const PayTypeEnum = z.enum(['MONTHLY', 'DAILY']);
export type PayType = z.infer<typeof PayTypeEnum>;

/** Fecha como YYYY-MM-DD. */
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

export const CreateUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  phone: z.string().max(20).nullable().optional(),
  role: UserRoleEnum,
  password: z.string().min(8).max(PASSWORD_MAX),
  /** PIN de aprobación (6 dígitos). Solo válido para ADMIN_OPERATIVO/DUENO. */
  pin: z
    .string()
    .regex(/^\d{6}$/, 'El PIN debe ser exactamente 6 dígitos')
    .optional(),
  /** Empleo inicial (opcional). El salario solo se EDITA luego con PIN. */
  hireDate: DateOnlySchema.nullable().optional(),
  payType: PayTypeEnum.nullable().optional(),
  salaryAmount: z.number().nonnegative().nullable().optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

/** Edición general (no toca salario/empleo, que va por el endpoint con PIN). */
export const UpdateUserSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).nullable().optional(),
  role: UserRoleEnum.optional(),
  active: z.boolean().optional(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

/** Días de descanso cíclicos (0=domingo … 6=sábado). Solo afecta a DAILY. */
const RestDaysOfWeekSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

/**
 * Cambio de EMPLEO (tipo de pago + salario + vinculación + días de descanso).
 * Solo Dueño + PIN obligatorio (header X-Approval-Pin). Genera registro de
 * auditoría/bitácora. `restDaysOfWeek` se ignora en MONTHLY (no cambia la paga).
 */
export const SetEmploymentSchema = z
  .object({
    payType: PayTypeEnum.nullable(),
    salaryAmount: z.number().nonnegative().nullable(),
    hireDate: DateOnlySchema.nullable().optional(),
    restDaysOfWeek: RestDaysOfWeekSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payType && (data.salaryAmount === null || data.salaryAmount === undefined || data.salaryAmount <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El salario debe ser mayor a 0 cuando hay tipo de pago.',
        path: ['salaryAmount'],
      });
    }
    if (data.restDaysOfWeek && data.restDaysOfWeek.length >= 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se pueden marcar los 7 días como descanso.',
        path: ['restDaysOfWeek'],
      });
    }
  });
export type SetEmployment = z.infer<typeof SetEmploymentSchema>;

/** Terminar el empleo: inactiva el usuario y liquida hasta la fecha dada. */
export const TerminateEmploymentSchema = z.object({
  date: DateOnlySchema,
  note: z.string().max(300).optional(),
});
export type TerminateEmployment = z.infer<typeof TerminateEmploymentSchema>;

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(PASSWORD_MAX),
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export const SetUserPinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'El PIN debe ser exactamente 6 dígitos'),
  /** Contraseña de quien hace el cambio: evita que una sesión abierta toque PINs. */
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
export type SetUserPin = z.infer<typeof SetUserPinSchema>;

/** Item de la lista de gestión: User público + empleo + si tiene PIN. */
export const ManagedUserSchema = UserSchema.extend({
  hasPin: z.boolean(),
  /** Dueño principal (el más antiguo): nadie lo elimina ni le cambia PIN/clave. */
  isPrimaryOwner: z.boolean(),
  hireDate: z.string().datetime().nullable(),
  payType: PayTypeEnum.nullable(),
  salaryAmount: z.number().nullable(),
  terminationDate: z.string().datetime().nullable(),
  /** Días de descanso cíclicos (0=domingo … 6=sábado). Solo aplica a DAILY. */
  restDaysOfWeek: z.array(z.number().int().min(0).max(6)),
});
export type ManagedUser = z.infer<typeof ManagedUserSchema>;
