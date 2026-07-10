import { requireDuenoServer } from '../../../features/auth/server';

/** Promociones = Dueño-only. El ADMIN_OPERATIVO no crea ni edita promos. */
export default async function PromotionsLayout({ children }: { children: React.ReactNode }) {
  await requireDuenoServer();
  return <>{children}</>;
}
