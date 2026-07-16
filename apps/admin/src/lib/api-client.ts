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
      // Con FormData NO se setea: el browser tiene que poner el multipart con su
      // boundary. Forzar el header acá deja al server sin poder parsear el body.
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
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

/**
 * Valida input contra un schema ANTES de enviarlo al backend. A diferencia de
 * `schema.parse()`, no deja escapar el `ZodError` crudo (cuyo `.message` es un
 * JSON de issues que terminaba mostrándose tal cual en la UI): lanza un `Error`
 * con un mensaje legible en español que los diálogos ya saben renderizar.
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(friendlyZodMessage(result.error));
  }
  return result.data;
}

function friendlyZodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  switch (issue.code) {
    case 'too_small':
      return issue.type === 'string'
        ? `Debe tener al menos ${issue.minimum} caracteres.`
        : `Debe ser al menos ${issue.minimum}.`;
    case 'too_big':
      return issue.type === 'string'
        ? `Debe tener máximo ${issue.maximum} caracteres.`
        : `Debe ser máximo ${issue.maximum}.`;
    case 'invalid_string':
      return issue.validation === 'email' ? 'El correo no es válido.' : issue.message;
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null'
        ? 'Falta completar un campo obligatorio.'
        : issue.message;
    default:
      return issue.message;
  }
}
