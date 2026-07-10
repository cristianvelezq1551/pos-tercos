import { requireOperativoServer } from '../../../features/auth/server';

/**
 * Segmento de CAJA dentro del admin (unificación POS+admin, Fase 1).
 * Gateado a ADMIN_OPERATIVO. En fases próximas este layout montará el motor
 * offline + socket /ws/pos + gates de turno (todo SCOPED acá, nunca en el
 * layout raíz del admin). El DUEÑO nunca llega — requireOperativoServer lo saca.
 * Ver UNIFICACION-POS-ADMIN.md.
 */
export default async function CajaLayout({ children }: { children: React.ReactNode }) {
  await requireOperativoServer();
  return <>{children}</>;
}
