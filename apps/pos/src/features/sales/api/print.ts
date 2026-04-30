export interface PrintReceiptResult {
  html: string;
  receiptKey: string | null;
  receiptUrl: string | null;
}

export async function printReceipt(saleId: string): Promise<PrintReceiptResult> {
  const res = await fetch(`/api/sales/${saleId}/print`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const html = await res.text();
  return {
    html,
    receiptKey: res.headers.get('x-receipt-key'),
    receiptUrl: res.headers.get('x-receipt-url'),
  };
}
