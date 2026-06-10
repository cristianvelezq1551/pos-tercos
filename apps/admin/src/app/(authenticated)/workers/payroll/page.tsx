import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { Clock } from 'lucide-react';
import { PaymentTable } from '../../../../features/workers';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';
import type { PagoReport } from '@pos-tercos/types';

interface PageProps {
  searchParams: Promise<{ start?: string }>;
}

const fmt = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Inicio del pago (1, 8, 16 o 23 del mes) que contiene la fecha. */
function paymentStartOf(d: Date): string {
  const day = d.getDate();
  const startDay = day <= 7 ? 1 : day <= 15 ? 8 : day <= 22 ? 16 : 23;
  return fmt(new Date(d.getFullYear(), d.getMonth(), startDay));
}

/** Inicio del pago anterior al que contiene startYmd. */
function prevPaymentStart(startYmd: string): string {
  const d = new Date(`${startYmd}T12:00:00`);
  d.setDate(d.getDate() - 1); // un día antes → garantiza pago anterior
  return paymentStartOf(d);
}

async function load(start: string): Promise<PagoReport | { error: string }> {
  try {
    return await serverFetchJson<PagoReport>(`/workers/period?start=${start}`);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function PayrollPage({ searchParams }: PageProps) {
  // requireRole(['DUENO']) bloquea cualquier otro rol con redirect → al pasar
  // de acá, el usuario es siempre Dueño (las acciones de pago se habilitan).
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const current = paymentStartOf(new Date());
  const previous = prevPaymentStart(current);
  const start = sp.start ?? current;
  const isCurrent = start === current;
  const result = await load(start);

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Nómina del pago"
        description="Lo que se le paga a cada empleado en este pago. El mes se divide en 2 quincenas, y cada quincena en 2 sub-pagos (4 pagos por mes). Toca un empleado para ver el detalle del mes."
        icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="mb-5 flex flex-wrap gap-2">
          <Link href={`/workers/payroll?start=${previous}`}>
            <Chip selected={!isCurrent} type="button">
              Pago anterior
            </Chip>
          </Link>
          <Link href="/workers/payroll">
            <Chip selected={isCurrent} type="button">
              Pago actual
            </Chip>
          </Link>
        </div>

        {'error' in result ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No se pudo cargar la nómina. {result.error}
          </p>
        ) : (
          <PaymentTable report={result} />
        )}
      </Container>
    </>
  );
}
