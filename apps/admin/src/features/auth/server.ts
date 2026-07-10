import { UserSchema, type User } from '@pos-tercos/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const ACCESS_COOKIE = 'admin_access';

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

/**
 * Guard de página/layout: exige rol DUEÑO. El ADMIN_OPERATIVO (= cajero de
 * confianza) no maneja catálogo (precios de venta, promos, recetas) — eso es
 * del dueño. Si no es dueño lo mandamos a Facturas (su área: compras/inventario).
 * Enforcement real vive en el backend (@OnlyDueno); esto solo evita mostrarle
 * páginas que no le sirven y que fallarían con 403 al guardar.
 */
export async function requireDuenoServer(): Promise<User> {
  const user = await getCurrentUserServer();
  if (!user || user.role !== 'DUENO') redirect('/invoices');
  return user;
}

/**
 * Guard del segmento de Caja (`/caja/*`). La caja es SOLO del ADMIN_OPERATIVO
 * (el cajero de confianza). El DUEÑO no opera caja (decisión del dueño) — se
 * redirige al Inicio. Sin sesión → login. Enforcement real en el backend
 * (@CashierAccess). Ver UNIFICACION-POS-ADMIN.md.
 */
export async function requireOperativoServer(): Promise<User> {
  const user = await getCurrentUserServer();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN_OPERATIVO') redirect('/');
  return user;
}
