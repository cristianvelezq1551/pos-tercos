const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export async function publicFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    // Default no-store (datos por-request: status de orden, etc.). El caller
    // puede optar por ISR pasando `next: { revalidate }` — entonces NO forzamos
    // no-store (son mutuamente excluyentes en Next).
    const optedIntoCache = (init as { next?: unknown } | undefined)?.next != null;
    const res = await fetch(`${API_URL}${path}`, {
      ...(optedIntoCache ? {} : { cache: 'no-store' }),
      ...init,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
