/**
 * Dispara la impresión del recibo. La impresión REAL la hace el backend vía
 * el print-agent (ESC/POS → impresora térmica Neotek 58mm). El POS NO imprime
 * desde el navegador (eso causaba papel infinito en la térmica).
 */
export async function printReceipt(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/print`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
