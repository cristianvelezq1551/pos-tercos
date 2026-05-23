import { Container, PageHeader } from '@pos-tercos/ui';
import { ClipboardList } from 'lucide-react';
import { BitacoraView } from '../../../features/bitacora';

export const dynamic = 'force-dynamic';

export default function BitacoraPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Bitácora"
        description="Registro operativo en vivo: aperturas y cierres de caja, anulaciones, aperturas de cajón, aprobaciones con PIN, inicios/cierres de sesión y demoras de cocina."
        icon={<ClipboardList className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <BitacoraView />
      </Container>
    </>
  );
}
