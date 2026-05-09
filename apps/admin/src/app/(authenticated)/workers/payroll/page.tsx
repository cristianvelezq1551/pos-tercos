import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Clock } from 'lucide-react';
import { PayrollPeriodTable } from '../../../../features/workers';
import { RangeFilter } from '../../../../features/reports-sales';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { PayrollPeriodReport } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 13);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(today) };
}

async function loadReport(
  from: string,
  to: string,
): Promise<PayrollPeriodReport | { error: string }> {
  try {
    return await serverFetchJson<PayrollPeriodReport>(
      `/workers/payroll-period?from=${from}&to=${to}`,
    );
  } catch (err) {
    if (err instanceof ApiError) return { error: `API ${err.status}` };
    return { error: 'Network error' };
  }
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;
  const result = await loadReport(from, to);

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Nómina del período"
        description="Total de horas y comisión estimada por trabajador en el rango. Vista previa del pago — no genera asientos contables ni movimientos en caja."
        icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <nav className="mb-5 flex flex-wrap gap-2">
          <Link href="/workers/attendance">
            <Chip type="button">Asistencia</Chip>
          </Link>
          <Link href="/workers/commissions">
            <Chip type="button">Comisiones</Chip>
          </Link>
          <Link href="/workers/payroll">
            <Chip selected type="button">
              Nómina del período
            </Chip>
          </Link>
        </nav>

        <div className="mb-5">
          <RangeFilter />
        </div>

        {'error' in result ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudo cargar el reporte. {result.error}
          </p>
        ) : (
          <PayrollPeriodTable report={result} />
        )}
      </Container>
    </>
  );
}
