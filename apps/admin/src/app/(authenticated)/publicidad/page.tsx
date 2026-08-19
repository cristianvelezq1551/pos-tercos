import { Container, PageHeader } from '@pos-tercos/ui';
import { Globe } from 'lucide-react';
import { WebConfigManager } from '../../../features/business-config';
import { PublicidadManager } from '../../../features/publicidad';
import { requireRole } from '../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function WebPage() {
  await requireRole(['ADMIN_OPERATIVO', 'DUENO']);
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Web del cliente"
        description="Publicidad, contacto, horarios, redes y la página “Nosotros”. Todo se actualiza al instante, sin redeploy."
        icon={<Globe className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <PublicidadManager />
          <WebConfigManager />
        </div>
      </Container>
    </>
  );
}
