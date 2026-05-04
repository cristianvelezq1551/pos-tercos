import { UserSchema, type User } from '@pos-tercos/types';
import { cookies } from 'next/headers';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const ACCESS_COOKIE = 'pos_access';

export async function getCurrentUserServer(): Promise<User | null> {
  const cookieStore = await cookies();
  const access = cookieStore.get(ACCESS_COOKIE);
  if (!access) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Cookie: `${ACCESS_COOKIE}=${access.value}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const parsed = UserSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Lee el access token de la cookie para handshake WS cross-origin (FASE 7.E). */
export async function getAccessTokenServer(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}
