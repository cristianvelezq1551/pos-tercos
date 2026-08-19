import Link from 'next/link';
import { Chip, Container, PageHeader } from '@pos-tercos/ui';
import { CalendarDays } from 'lucide-react';
import { WeeklyPayrollView } from '../../../../features/workers';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';
import type { WeeklyPayrollReport } from '@pos-tercos/types';
import { ymdLocalToday } from '../../../../lib/dates';

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

async function load(week: string): Promise<WeeklyPayrollReport | { error: string }> {
  try {
    return await serverFetchJson<WeeklyPayrollReport>(`/workers/weekly?week=${week}`);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

export default async function WeeklyPayrollPage({ searchParams }: PageProps) {
  await requireRole(['DUENO']);
  const sp = await searchParams;
  // Ver `ymdLocalToday`: con `toISOString` un domingo de noche la página
  // abría en la semana siguiente.
  const ref = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : ymdLocalToday();
  const result = await load(ref);

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Nómina"
        description="Pago semanal de todo el personal. Los empleados por mes ven su salario prorrateado por día; los de jornal, por días trabajados. Puedes abonar parcial o saldar la semana, sumar bonos o descuentos — cada pago pide comprobante. El descanso se corre solo si el lunes es festivo."
        icon={<CalendarDays className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {!('error' in result) ? (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Link href={`/workers/semana?week=${result.prevRef}`}>
              <Chip type="button">← Semana anterior</Chip>
            </Link>
            <Link href="/workers/semana">
              <Chip type="button">Semana actual</Chip>
            </Link>
            <Link href={`/workers/semana?week=${result.nextRef}`}>
              <Chip type="button">Semana siguiente →</Chip>
            </Link>
            <span className="ml-1 text-sm font-semibold text-foreground">{result.weekLabel}</span>
          </div>
        ) : null}

        {'error' in result ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No se pudo cargar la nómina semanal. {result.error}
          </p>
        ) : (
          <WeeklyPayrollView report={result} />
        )}
      </Container>
    </>
  );
}
