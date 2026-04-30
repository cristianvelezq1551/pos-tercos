import { z } from 'zod';

const DrawerOpenResultSchema = z.object({
  ok: z.literal(true),
  at: z.string(),
  reason: z.string().nullable(),
});
export type DrawerOpenResult = z.infer<typeof DrawerOpenResultSchema>;

export async function openDrawerForSale(saleId: string): Promise<DrawerOpenResult> {
  const res = await fetch(`/api/sales/${saleId}/open-drawer`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return DrawerOpenResultSchema.parse(json);
}
