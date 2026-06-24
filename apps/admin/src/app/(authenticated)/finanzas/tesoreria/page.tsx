import { Container, PageHeader } from '@pos-tercos/ui';
import { Wallet } from 'lucide-react';
import {
  TreasuryBalances,
  TreasuryConfigCard,
  TreasuryMovements,
  getTreasuryConfigServer,
  getTreasuryMovementsServer,
  getTreasurySummaryServer,
} from '../../../../features/treasury';
import { requireRole } from '../../../../lib/guards';

export const dynamic = 'force-dynamic';

export default async function TreasuryPage() {
  await requireRole(['DUENO']);
  const [summary, config, movements] = await Promise.all([
    getTreasurySummaryServer(),
    getTreasuryConfigServer(),
    getTreasuryMovementsServer(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Tesorería"
        description="Cuánto tenés y cómo lo tenés: Efectivo y Cuenta. Se alimenta solo de las ventas y los pagos; vos cargás traspasos, ajustes y los saldos iniciales."
        icon={<Wallet className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-6">
          <TreasuryBalances summary={summary} />
          <TreasuryConfigCard config={config} />
          <TreasuryMovements movements={movements} />
        </div>
      </Container>
    </>
  );
}
