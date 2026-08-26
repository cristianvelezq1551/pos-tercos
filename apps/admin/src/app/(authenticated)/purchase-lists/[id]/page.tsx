import { Container, PageHeader } from '@pos-tercos/ui';
import { ClipboardList } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PurchaseListDetail } from '../../../../features/purchase-lists';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { PurchaseList } from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseListDetailPage({ params }: PageProps) {
  const { id } = await params;

  let list: PurchaseList;
  try {
    list = await serverFetchJson<PurchaseList>(`/purchase-lists/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title={list.title ?? 'Lista de faltantes'}
        description={list.notes ?? undefined}
        icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />}
        breadcrumbs={[
          { label: 'Listas de faltantes', href: '/purchase-lists' },
          { label: list.title ?? 'Lista' },
        ]}
      />
      <Container size="7xl" padY="md">
        <PurchaseListDetail initial={list} />
      </Container>
    </>
  );
}
