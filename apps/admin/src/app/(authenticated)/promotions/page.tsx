import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { Tag } from 'lucide-react';
import { PromotionsTable } from '../../../features/promotions';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Promotion } from '@pos-tercos/types';

async function loadPromotions(): Promise<Promotion[] | { error: string }> {
  try {
    return await serverFetchJson<Promotion[]>('/promotions');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function PromotionsPage() {
  const result = await loadPromotions();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Promociones"
        description="Descuentos automáticos que se aplican al cobrar la venta. 4 tipos: descuento %, descuento fijo, BOGO y combo."
        icon={<Tag className="h-6 w-6" strokeWidth={1.75} />}
        actions={
          <Link href="/promotions/new">
            <Button>Nueva promoción</Button>
          </Link>
        }
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <PromotionsTable promotions={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar las promociones. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
