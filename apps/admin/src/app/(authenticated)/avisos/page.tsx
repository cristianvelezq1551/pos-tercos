import { PageHeader } from '@pos-tercos/ui';
import { AvisosPanel } from '../../../features/notifications';

export const dynamic = 'force-dynamic';

export default function AvisosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Avisos"
        description="Recibe en el celular o el computador lo que pasa en el negocio, aunque tengas la app cerrada."
      />
      <AvisosPanel />
    </div>
  );
}
