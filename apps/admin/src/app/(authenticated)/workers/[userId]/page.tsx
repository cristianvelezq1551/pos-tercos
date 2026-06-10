import Link from 'next/link';
import { Container, PageHeader } from '@pos-tercos/ui';
import { ArrowLeft, Users } from 'lucide-react';
import { EmployeePanel } from '../../../../features/workers';
import { requireRole } from '../../../../lib/guards';

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function EmployeePayrollPage({ params }: PageProps) {
  await requireRole(['DUENO']);
  const { userId } = await params;

  return (
    <>
      <PageHeader
        eyebrow="Personal · Nómina"
        title="Pagos del empleado"
        description="Detalle del mes: 2 quincenas con 2 sub-pagos cada una (4 pagos por mes), días y novedades. Edita días (modalidad diaria), agrega bonos/descuentos, cambia el salario y los días de descanso (con PIN) o termina el empleo."
        icon={<Users className="h-6 w-6" strokeWidth={1.75} />}
        breadcrumbs={[
          { label: 'Nómina', href: '/workers/payroll' },
          { label: 'Empleado' },
        ]}
      />
      <Container size="7xl" padY="md">
        <Link
          href="/workers/payroll"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a la nómina
        </Link>
        <EmployeePanel userId={userId} />
      </Container>
    </>
  );
}
