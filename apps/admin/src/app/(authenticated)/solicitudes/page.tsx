import { Container, PageHeader } from '@pos-tercos/ui';
import { Gift } from 'lucide-react';
import { CortesiasPanel, getCortesiasServer } from '../../../features/cortesias';
import { requireRole } from '../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function SolicitudesPage() {
  await requireRole(['ADMIN_OPERATIVO', 'DUENO']);
  const pending = await getCortesiasServer('PENDING');

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Solicitudes de cortesía"
        description="Cortesías que el cajero regaló (línea de un pedido o suelto). Confirmá o rechazá cada una. El stock ya se descontó; al aprobar se reconoce el gasto a costo."
        icon={<Gift className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="4xl" padY="md">
        <CortesiasPanel initial={pending} />
      </Container>
    </>
  );
}
