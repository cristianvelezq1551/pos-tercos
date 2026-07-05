import type { ZodType } from 'zod';

/** GET tipado contra el backend (vía el rewrite /api → API). Zod-parse del body. */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw await toError(res);
  return schema.parse(await res.json());
}

/** POST/PATCH tipado. Si hay `schema`, parsea la respuesta; si no, la ignora. */
export async function apiSend<T>(
  path: string,
  body: unknown,
  schema?: ZodType<T>,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client-App': 'cocina' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  const json = await res.json().catch(() => null);
  return schema ? schema.parse(json) : (json as T);
}

async function toError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new Error(body?.message ?? `Error ${res.status}`);
}
