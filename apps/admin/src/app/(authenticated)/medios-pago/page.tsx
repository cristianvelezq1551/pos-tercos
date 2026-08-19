import { Container, PageHeader } from '@pos-tercos/ui';
import { CreditCard } from 'lucide-react';
import { requireRole } from '../../../lib/guards';
import { PaymentMethodsManager } from '../../../features/payment-methods';

export const dynamic = 'force-dynamic';

export default async function MediosPagoPage() {
  // §3.8: solo el Dueño configura los medios de pago (la verificación de pagos
  // digitales es un control antifraude; el operativo que cobra no lo debilita).
  await requireRole(['DUENO']);
  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Medios de pago"
        description="Qué formas de pago ofrece el POS al cobrar. Habilita solo las que el negocio realmente acepta."
        icon={<CreditCard className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="max-w-2xl">
          <PaymentMethodsManager />
        </div>
      </Container>
    </>
  );
}
