const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export interface PublicFetchResult<T> {
  ok: boolean;
  /** HTTP status del backend, o 0 si la request falló por red. */
  status: number;
  data: T | null;
}

/**
 * Fetch público que preserva el status. Úsalo cuando el caller necesita
 * distinguir 401 (token vencido) de 404 (no existe) de 5xx (reintentable).
 */
export async function publicFetchResult<T>(
  path: string,
  init?: RequestInit,
): Promise<PublicFetchResult<T>> {
  try {
    // Default no-store (datos por-request: status de orden, etc.). El caller
    // puede optar por ISR pasando `next: { revalidate }` — entonces NO forzamos
    // no-store (son mutuamente excluyentes en Next).
    const optedIntoCache = (init as { next?: unknown } | undefined)?.next != null;
    const res = await fetch(`${API_URL}${path}`, {
      ...(optedIntoCache ? {} : { cache: 'no-store' }),
      ...init,
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function publicFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const result = await publicFetchResult<T>(path, init);
  return result.ok ? result.data : null;
}
