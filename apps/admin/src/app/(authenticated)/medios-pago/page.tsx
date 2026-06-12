import { Container, PageHeader } from '@pos-tercos/ui';
import { CreditCard } from 'lucide-react';
import { PaymentMethodsManager } from '../../../features/payment-methods';

export const dynamic = 'force-dynamic';

export default function MediosPagoPage() {
  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Medios de pago"
        description="Qué formas de pago ofrece el POS al cobrar. Habilitá solo las que el negocio realmente acepta."
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
