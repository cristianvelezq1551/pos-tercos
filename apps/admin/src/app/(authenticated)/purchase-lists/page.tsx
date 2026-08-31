import { Container, PageHeader } from '@pos-tercos/ui';
import { ClipboardList } from 'lucide-react';
import { NewListButton, PurchaseListsTable, ShortageAlert } from '../../../features/purchase-lists';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { PurchaseListSummary, ShortageCandidate } from '@pos-tercos/types';

export default async function PurchaseListsPage() {
  let result: PurchaseListSummary[] | { error: string };
  try {
    result = await serverFetchJson<PurchaseListSummary[]>('/purchase-lists?limit=50');
  } catch (err) {
    result = { error: friendlyApiError(err) };
  }

  // Si los faltantes fallan, la pantalla NO se cae: las listas ya guardadas son
  // lo que el dueño vino a ver, y el aviso es un complemento.
  const candidates = await serverFetchJson<ShortageCandidate[]>(
    '/purchase-lists/candidates?onlyLow=true',
  ).catch(() => null);

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Listas de faltantes"
        description="El único lugar donde se decide qué comprar. El sistema avisa qué bajó del mínimo y con cuánto vuelve a estar en pie; tú ajustas, la IA revisa si las cantidades alcanzan, y sale el papel con el que vas al mercado —completo o partido por proveedor."
        icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />}
        actions={<NewListButton />}
      />
      <Container size="7xl" padY="md">
        {candidates ? <ShortageAlert candidates={candidates} /> : null}
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
