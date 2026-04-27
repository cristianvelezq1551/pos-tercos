import { UserSchema, type User } from '@pos-tercos/types';
import { cookies } from 'next/headers';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const ACCESS_COOKIE = 'pos_access';

/**
 * Obtiene el usuario actual desde Server Components.
 * Forwardea la cookie de access al backend para autenticar.
 * Devuelve null si no hay sesión válida.
 */
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
