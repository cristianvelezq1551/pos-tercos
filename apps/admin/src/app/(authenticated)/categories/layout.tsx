import { requireDuenoServer } from '../../../features/auth/server';

/** Catálogo = Dueño-only. El ADMIN_OPERATIVO no administra categorías. */
export default async function CategoriesLayout({ children }: { children: React.ReactNode }) {
  await requireDuenoServer();
  return <>{children}</>;
}
