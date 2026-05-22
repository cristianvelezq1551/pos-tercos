export async function acceptWebOrder(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/accept`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
