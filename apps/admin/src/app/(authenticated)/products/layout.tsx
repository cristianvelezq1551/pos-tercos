import { requireDuenoServer } from '../../../features/auth/server';

/** Catálogo = Dueño-only. El ADMIN_OPERATIVO no ve ni edita productos/precios. */
export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  await requireDuenoServer();
  return <>{children}</>;
}
