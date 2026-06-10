import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Sparkles } from 'lucide-react';
import {
  RunActionsBar,
  SuggestionsTable,
} from '../../../features/purchase-suggestions';
import { serverFetchJson } from '../../../lib/api-server';
import { friendlyApiError } from '../../../lib/error-copy';
import type { PurchaseSuggestion } from '@pos-tercos/types';

const FILTER_TABS: { value: string; label: string }[] = [
  { value: 'PENDING,EVALUATED', label: 'Abiertas' },
  { value: 'PENDING', label: 'Sin evaluar' },
  { value: 'EVALUATED', label: 'Evaluadas' },
  { value: 'ACCEPTED', label: 'Aceptadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'STALE', label: 'Vencidas' },
  { value: '', label: 'Todas' },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

async function loadSuggestions(
  status: string | undefined,
): Promise<PurchaseSuggestion[] | { error: string }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  try {
    return await serverFetchJson<PurchaseSuggestion[]>(`/purchase-suggestions${qs}`);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function PurchaseSuggestionsPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const filterValue = status ?? FILTER_TABS[0].value;
  const result = await loadSuggestions(filterValue || undefined);

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Sugerencias de compra"
        description="Detección automática de insumos con stock por debajo del mínimo. La IA evalúa el costo y la cantidad sugerida, tú decides si la apruebas."
        icon={<Sparkles className="h-6 w-6" strokeWidth={1.75} />}
        actions={<RunActionsBar />}
      />
      <Container size="7xl" padY="md">
        <nav className="mb-5 flex flex-wrap gap-2">
          {FILTER_TABS.map((t) => {
            const isActive = filterValue === t.value;
            const href = t.value
              ? `/purchase-suggestions?status=${encodeURIComponent(t.value)}`
              : '/purchase-suggestions?status=';
            return (
              <Link key={t.value || 'all'} href={href}>
                <Chip selected={isActive} type="button">
                  {t.label}
                </Chip>
              </Link>
            );
          })}
        </nav>

        {Array.isArray(result) ? (
          <SuggestionsTable suggestions={result} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar las sugerencias. {result.error}
          </p>
        )}
      </Container>
    </>
  );
}
