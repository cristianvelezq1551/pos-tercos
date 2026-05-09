import { notFound } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
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
    <>
      <PageHeader
        eyebrow="Compras"
        title={`Sugerencia: ${suggestion.entityName}`}
        description="Detectada por el sistema cuando las existencias quedaron por debajo del mínimo."
        breadcrumbs={[
          { label: 'Sugerencias inteligentes', href: '/purchase-suggestions' },
          { label: suggestion.entityName },
        ]}
      />
      <Container size="6xl" padY="md">
        <SuggestionDetail initial={suggestion} />
      </Container>
    </>
  );
}
