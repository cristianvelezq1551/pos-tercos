import { z } from 'zod';

export const UserRoleEnum = z.enum([
  'CAJERO',
  'COCINERO',
  'ADMIN_OPERATIVO',
  'DUENO',
  'TRABAJADOR',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

/** Etiquetas canónicas de rol (única fuente — no redefinir en las apps). */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  DUENO: 'Dueño',
  ADMIN_OPERATIVO: 'Admin operativo',
  CAJERO: 'Cajero',
  COCINERO: 'Cocinero',
  TRABAJADOR: 'Trabajador',
};

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
  /** Alcance del token. Ausente = credencial de sesión completa (cookie
   *  httpOnly). `'ws'` = token efímero que SÍ es legible por el JS de la
   *  página, emitido solo para el handshake de WebSocket: el guard HTTP lo
   *  RECHAZA, así que robarlo por XSS no da acceso a la API. */
  scope: z.literal('ws').optional(),
});
export type JwtAccessPayload = z.infer<typeof JwtAccessPayloadSchema>;
