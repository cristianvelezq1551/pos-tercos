import type { z } from 'zod';

/**
 * Wrapper único de fetch + Zod para los clientes de feature del admin.
 * Antes vivía duplicado (16 copias idénticas de `request<T>`). Mantiene el
 * contrato: prefija `/api`, manda cookies, setea Content-Type si hay body,
 * lanza `Error(message)` con el mensaje del backend, y valida la respuesta
 * con el schema (single source of truth de tipos).
 */
export async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodSchema<T>,
): Promise<T> {
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
