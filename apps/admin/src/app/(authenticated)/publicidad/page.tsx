import { Container, PageHeader } from '@pos-tercos/ui';
import { Megaphone } from 'lucide-react';
import { PublicidadManager } from '../../../features/publicidad';
import { requireRole } from '../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function PublicidadPage() {
  await requireRole(['ADMIN_OPERATIVO', 'DUENO']);
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Publicidad web"
        description="Las imágenes que se muestran arriba de la página web del cliente, encima del menú. Se actualizan al instante, sin redeploy."
        icon={<Megaphone className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <PublicidadManager />
      </Container>
    </>
  );
}
