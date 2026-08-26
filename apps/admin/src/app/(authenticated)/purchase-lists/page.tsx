import { Container, PageHeader } from '@pos-tercos/ui';
import { ClipboardList } from 'lucide-react';
import { NewListButton, PurchaseListsTable } from '../../../features/purchase-lists';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { PurchaseListSummary } from '@pos-tercos/types';

export default async function PurchaseListsPage() {
  let result: PurchaseListSummary[] | { error: string };
  try {
    result = await serverFetchJson<PurchaseListSummary[]>('/purchase-lists?limit=50');
  } catch (err) {
    result = { error: friendlyApiError(err) };
  }

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Listas de faltantes"
        description="La hoja con la que sales a comprar: eliges qué falta y cuánto pedir de cada cosa, mirando las existencias y el mínimo. Se imprime completa o partida por proveedor."
        icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />}
        actions={<NewListButton />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(result) ? (
          <PurchaseListsTable lists={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar las listas. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
