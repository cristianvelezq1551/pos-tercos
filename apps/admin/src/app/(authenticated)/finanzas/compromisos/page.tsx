import { Container, PageHeader } from '@pos-tercos/ui';
import { HandCoins } from 'lucide-react';
import { PayablesView, getPayablesServer } from '../../../../features/payables';
import { requireRole } from '../../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function PayablesPage() {
  await requireRole(['DUENO']);
  const payables = await getPayablesServer();

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Compromisos por pagar"
        description="Lo que el negocio le debe a una persona, fuera de proveedores, costos fijos y nómina. Al pagar elegís efectivo, cuenta o mixto. Entra a la Tesorería."
        icon={<HandCoins className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <PayablesView payables={payables} />
      </Container>
    </>
  );
}
