import {
  CreateUserSchema,
  ManagedUserSchema,
  ResetPasswordSchema,
  SetEmploymentSchema,
  SetUserPinSchema,
  TerminateEmploymentSchema,
  UpdateUserSchema,
  type CreateUser,
  type ManagedUser,
  type SetEmployment,
  type TerminateEmployment,
  type UpdateUser,
} from '@pos-tercos/types';
import { z } from 'zod';

const UserListSchema = z.array(ManagedUserSchema);

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

/** Para endpoints 204 (sin cuerpo de respuesta). */
async function requestVoid(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
}

export function listUsers(): Promise<ManagedUser[]> {
  return request('/users', { method: 'GET' }, UserListSchema);
}

export function createUser(input: CreateUser): Promise<ManagedUser> {
  CreateUserSchema.parse(input);
  return request('/users', { method: 'POST', body: JSON.stringify(input) }, ManagedUserSchema);
}

export function updateUser(id: string, input: UpdateUser): Promise<ManagedUser> {
  UpdateUserSchema.parse(input);
  return request(
    `/users/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    ManagedUserSchema,
  );
}

export function resetUserPassword(id: string, newPassword: string): Promise<void> {
  ResetPasswordSchema.parse({ newPassword });
  return requestVoid(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export function setUserPin(id: string, pin: string, password: string): Promise<void> {
  SetUserPinSchema.parse({ pin, password });
  return requestVoid(`/users/${id}/pin`, {
    method: 'POST',
    body: JSON.stringify({ pin, password }),
  });
}

/** Cambiar MI PROPIO PIN de aprobación (autoservicio). Pide la contraseña. */
export function setOwnApprovalPin(pin: string, password: string): Promise<void> {
  return requestVoid('/approvals/pin', {
    method: 'POST',
    body: JSON.stringify({ pin, password }),
  });
}

/** Cambiar salario / tipo de pago. Requiere PIN (header X-Approval-Pin). */
export function setEmployment(id: string, input: SetEmployment, pin: string): Promise<ManagedUser> {
  SetEmploymentSchema.parse(input);
  return request(
    `/users/${id}/employment`,
    { method: 'POST', body: JSON.stringify(input), headers: { 'X-Approval-Pin': pin } },
    ManagedUserSchema,
  );
}

/** Eliminar definitivamente (solo si no tiene historial operativo). Requiere PIN. */
export function deleteUser(id: string, pin: string): Promise<void> {
  return requestVoid(`/users/${id}`, { method: 'DELETE', headers: { 'X-Approval-Pin': pin } });
}

/** Terminar empleo (inactiva el usuario y liquida hasta la fecha). Requiere PIN. */
export function terminateEmployment(id: string, input: TerminateEmployment, pin: string): Promise<ManagedUser> {
  TerminateEmploymentSchema.parse(input);
  return request(
    `/users/${id}/terminate`,
    { method: 'POST', body: JSON.stringify(input), headers: { 'X-Approval-Pin': pin } },
    ManagedUserSchema,
  );
}
