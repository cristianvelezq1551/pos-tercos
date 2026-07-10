import { requireDuenoServer } from '../../../features/auth/server';

/**
 * Catálogo = Dueño-only en la navegación. El ADMIN_OPERATIVO no administra
 * insumos desde acá; SÍ puede registrar un insumo nuevo inline al cargar una
 * factura (ese flujo vive en /invoices y el endpoint sigue en @AdminAccess).
 */
export default async function IngredientsLayout({ children }: { children: React.ReactNode }) {
  await requireDuenoServer();
  return <>{children}</>;
}
