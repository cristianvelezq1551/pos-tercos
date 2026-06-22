import { Container, PageHeader, Section } from '@pos-tercos/ui';
import { ArrowLeftRight } from 'lucide-react';
import {
  ReconciliationHistory,
  ReconciliationView,
} from '../../../../features/reports';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { SavedReconciliation } from '@pos-tercos/types';
import { requireRole } from '../../../../lib/guards';

async function loadHistory(): Promise<SavedReconciliation[]> {
  try {
    return await serverFetchJson<SavedReconciliation[]>(
      '/reports/payment-reconciliation/history?limit=20',
    );
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('[reconciliation history] api error', err.status, err.body);
    }
    return [];
  }
}

export default async function ReconciliationPage() {
  // Reportes financieros: solo el Dueño (defensa en profundidad — el endpoint ya es @OnlyDueno).
  await requireRole(['DUENO']);
  const history = await loadHistory();
  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Reconciliación de pagos"
        description="Sube el extracto CSV de Nequi o Bancolombia. Comparamos cada transacción contra las ventas confirmadas como digitales."
        icon={<ArrowLeftRight className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-8">
          <ul className="space-y-1.5 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <strong className="shrink-0 text-success">Coincide</strong>
              <span>· la fila del CSV y la venta del POS coinciden por monto y fecha (±24h).</span>
            </li>
            <li className="flex gap-2">
              <strong className="shrink-0 text-destructive">CSV sin POS</strong>
              <span>· pago en banco que no aparece en el POS (sospechoso).</span>
            </li>
            <li className="flex gap-2">
              <strong className="shrink-0 text-warning">POS sin CSV</strong>
              <span>· venta digital del POS sin transacción en banco (revisar al cajero).</span>
            </li>
          </ul>

          <Section eyebrow="Importar" title="Nuevo CSV" size="md">
            <ReconciliationView />
          </Section>

          <Section eyebrow="Histórico" title="Últimos 20" size="md">
            <ReconciliationHistory reports={history} />
          </Section>
        </div>
      </Container>
    </>
  );
}
