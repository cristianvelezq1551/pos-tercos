import { requireDuenoServer } from '../../../features/auth/server';

/** Catálogo = Dueño-only. El ADMIN_OPERATIVO no ve ni edita subproductos/recetas. */
export default async function SubproductsLayout({ children }: { children: React.ReactNode }) {
  await requireDuenoServer();
  return <>{children}</>;
}
