import Link from 'next/link';
import { Button, Container, PageHeader } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { SubproductsTable } from '../../../features/subproducts';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
import type { Subproduct } from '@pos-tercos/types';

async function loadSubproducts(): Promise<Subproduct[] | { error: string }> {
  try {
    return await serverFetchJson<Subproduct[]>('/subproducts');
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `API ${err.status}` };
    }
    return { error: 'Network error' };
  }
}

export default async function SubproductsPage() {
  const result = await loadSubproducts();

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Subproductos"
        description="Intermedios cocinados que se usan en la receta de productos vendibles. Define el yield (unidades por batch) para que el sistema calcule consumo proporcional."
        icon={<BrandIcon name="knife" className="h-6 w-6" />}
        actions={
          <Link href="/subproducts/new">
            <Button>Nuevo subproducto</Button>
          </Link>
        }
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <SubproductsTable subproducts={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los subproductos. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
