import type { ReconciliationReport, ReconciliationSource } from '@pos-tercos/types';
import { verificarTamano } from '../../../lib/subir-archivo';

/**
 * Sube un CSV de extracto (Nequi/Bancolombia) y devuelve el reporte de
 * conciliación. `save=true` lo persiste en el histórico (Dueño-only).
 */
export async function importReconciliation(
  source: ReconciliationSource,
  file: File,
  save: boolean,
): Promise<ReconciliationReport> {
  const fd = new FormData();
  verificarTamano(file);
  fd.append('file', file);
  const qs = new URLSearchParams({ source });
  if (save) qs.set('save', 'true');

  const res = await fetch(`/api/reports/payment-reconciliation/import?${qs.toString()}`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return (await res.json()) as ReconciliationReport;
}
