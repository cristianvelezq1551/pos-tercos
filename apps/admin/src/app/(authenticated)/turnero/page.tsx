import { Container, PageHeader } from '@pos-tercos/ui';
import { MonitorPlay } from 'lucide-react';
import { TurneroManager } from '../../../features/turnero';
import { requireRole } from '../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function TurneroPage() {
  await requireRole(['ADMIN_OPERATIVO', 'DUENO']);
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Turnero"
        description="Qué se muestra en la pantalla del local: los productos del B-roll, sus fotos y precios, y la música ambiente. Se actualiza al instante, sin redeploy."
        icon={<MonitorPlay className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <TurneroManager />
      </Container>
    </>
  );
}
