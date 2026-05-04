import Link from 'next/link';
import {
  RunActionsBar,
  SuggestionsTable,
} from '../../../features/purchase-suggestions';
import { ApiError, serverFetchJson } from '../../../lib/api-server';
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
    return await serverFetchJson<PurchaseSuggestion[]>(
      `/purchase-suggestions${qs}`,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function PurchaseSuggestionsPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const filterValue = status ?? FILTER_TABS[0].value;
  const result = await loadSuggestions(filterValue || undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sugerencias de compra
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Cron horario detecta stockables con stock por debajo del threshold y
            crea sugerencias automáticamente. Podés evaluarlas con IA y
            aceptarlas o rechazarlas.
          </p>
        </div>
        <RunActionsBar />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((t) => {
          const isActive = filterValue === t.value;
          return (
            <Link
              key={t.value || 'all'}
              href={
                t.value
                  ? `/purchase-suggestions?status=${encodeURIComponent(t.value)}`
                  : '/purchase-suggestions?status='
              }
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {Array.isArray(result) ? (
        <SuggestionsTable suggestions={result} />
      ) : (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las sugerencias. {result.error}
        </p>
      )}
    </div>
  );
}
