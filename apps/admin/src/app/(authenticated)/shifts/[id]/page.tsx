import { Container, PageHeader } from '@pos-tercos/ui';
import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShiftSessionDetailView } from '../../../../features/shifts';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import type { ShiftSessionDetail } from '@pos-tercos/types';

async function loadDetail(
  id: string,
): Promise<ShiftSessionDetail | { error: string } | null> {
  try {
    return await serverFetchJson<ShiftSessionDetail>(`/shifts/${id}/detail`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return { error: friendlyApiError(err) };
  }
}

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadDetail(id);

  if (result === null) notFound();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/shifts" className="hover:underline">
            ← Turnos
          </Link>
        }
        title="Detalle de caja"
        description="Sesión consolidada del día: caja, ventas y pedidos. Reabrí la caja si fue cerrada por error."
        icon={<Wallet className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {'error' in result ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar el detalle. {result.error}
          </p>
        ) : (
          <ShiftSessionDetailView detail={result} />
        )}
      </Container>
    </>
  );
}
