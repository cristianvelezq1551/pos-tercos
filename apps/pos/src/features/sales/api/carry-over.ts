import { SaleSchema, type Sale } from '@pos-tercos/types';

/**
 * Traspasa una cuenta abierta a la próxima caja: el backend le suelta el
 * shiftId para que salga del arqueo/reporte de la caja que se cierra. Sigue
 * PENDIENTE_PAGO y se cobra en la caja que esté abierta cuando se pague.
 */
export async function carryOverOpenTab(saleId: string): Promise<Sale> {
  const res = await fetch(`/api/sales/${saleId}/carry-over`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `carryOverOpenTab failed: ${res.status}`);
  }
  return SaleSchema.parse(await res.json());
}
