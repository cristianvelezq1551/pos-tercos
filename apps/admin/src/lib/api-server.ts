import { cookies } from 'next/headers';
import type { z } from 'zod';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const ACCESS_COOKIE = 'admin_access';

/**
 * Forwards the access cookie to the backend API from a Server Component
 * or Route Handler. Returns the raw `Response`; callers parse with their
 * own Zod schema.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const access = cookieStore.get(ACCESS_COOKIE);
  const headers = new Headers(init.headers);
  if (access) {
    headers.set('Cookie', `${ACCESS_COOKIE}=${access.value}`);
  }
  if (!headers.has('Content-Type') && (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.name = 'ApiError';
  }
}

/**
 * Fetch SSR + JSON. Si se pasa `schema`, valida la respuesta con Zod (mismo
 * contrato que los clientes de feature); sin él, castea crudo (compat hacia
 * atrás). Pasar siempre el schema en datos sensibles (reportes) — así un cambio
 * de contrato del backend falla fuerte en vez de romper la UI silenciosamente.
 */
export async function serverFetchJson<T>(
  path: string,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  const res = await serverFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  const json = (await res.json()) as unknown;
  return schema ? schema.parse(json) : (json as T);
}
