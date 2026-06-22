import { z } from 'zod';

export const UserRoleEnum = z.enum([
  'CAJERO',
  'COCINERO',
  'ADMIN_OPERATIVO',
  'DUENO',
  'TRABAJADOR',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: UserRoleEnum,
  mustChangePwd: z.boolean(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  oldPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const JwtAccessPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: UserRoleEnum,
  email: z.string().email(),
  /** Versión de sesión: si no coincide con users.token_version, el access fue
   *  revocado (baja/cambio de rol/reset). Opcional para no invalidar tokens
   *  viejos (se tratan como tv=0) al desplegar. */
  tv: z.number().int().optional(),
});
export type JwtAccessPayload = z.infer<typeof JwtAccessPayloadSchema>;
