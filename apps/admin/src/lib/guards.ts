import { redirect } from 'next/navigation';
import type { UserRole } from '@pos-tercos/types';
import { getCurrentUserServer } from '../features/auth/server';

/**
 * Guard de página para Server Components. Redirige a /unauthorized si el usuario
 * actual no tiene un rol permitido. Úsalo en páginas más restrictivas que el
 * middleware (que solo separa ADMIN_OPERATIVO/DUENO de los demás), p. ej. las
 * vistas solo-Dueño: auditoría cruda y anomalías anti-fraude.
 */
export async function requireRole(allowed: readonly UserRole[]): Promise<void> {
  const user = await getCurrentUserServer();
  if (!user || !allowed.includes(user.role)) {
    redirect('/unauthorized');
  }
}
