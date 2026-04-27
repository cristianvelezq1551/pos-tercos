import { z } from 'zod';

export const UserRoleEnum = z.enum([
  'CAJERO',
  'COCINERO',
  'REPARTIDOR',
  'ADMIN_OPERATIVO',
  'DUENO',
  'TRABAJADOR',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const RepartidorAvailabilityEnum = z.enum(['DISPONIBLE', 'OCUPADO', 'OFFLINE']);
export type RepartidorAvailability = z.infer<typeof RepartidorAvailabilityEnum>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: UserRoleEnum,
  mustChangePwd: z.boolean(),
  active: z.boolean(),
  availability: RepartidorAvailabilityEnum.nullable().optional(),
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
});
export type JwtAccessPayload = z.infer<typeof JwtAccessPayloadSchema>;
