import { notFound } from 'next/navigation';
import { SuggestionDetail } from '../../../../features/purchase-suggestions';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { PurchaseSuggestion } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SuggestionDetailPage({ params }: PageProps) {
  const { id } = await params;

  let suggestion: PurchaseSuggestion;
  try {
    suggestion = await serverFetchJson<PurchaseSuggestion>(
      `/purchase-suggestions/${id}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Sugerencia: {suggestion.entityName}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Detectada por el sistema cuando el stock cayó bajo el threshold.
        </p>
      </div>
      <SuggestionDetail initial={suggestion} />
    </div>
  );
}
