import { Container, PageHeader } from '@pos-tercos/ui';
import { Coins } from 'lucide-react';
import { FixedCostsManager } from '../../../../features/fixed-costs';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';
import type { FinancePendingFixedCost, FixedCost } from '@pos-tercos/types';

export default async function CostosFijosPage() {
  await requireRole(['DUENO']);

  let costs: FixedCost[] | { error: string };
  let pending: FinancePendingFixedCost[] = [];
  try {
    costs = await serverFetchJson<FixedCost[]>('/fixed-costs');
  } catch (err) {
    costs = { error: friendlyApiError(err) };
  }
  // El panel de pendientes NO debe tumbar el catálogo: si el endpoint falla
  // (ej. API sin reiniciar), se ve la tabla igual y el panel queda vacío.
  try {
    pending = await serverFetchJson<FinancePendingFixedCost[]>('/fixed-costs/pending');
  } catch {
    pending = [];
  }

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Costos y gastos"
        description="Recurrentes (alquiler, servicios, software, contador…) y gastos puntuales (ej. una reparación). Mensual = cada mes; Anual = ÷12; Puntual = una vez en su fecha. La nómina NO va aquí — se jala automática del módulo de Nómina."
        icon={<Coins className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(costs) ? (
          <FixedCostsManager costs={costs} pending={pending} />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            No se pudieron cargar los costos fijos. {costs.error}
          </p>
        )}
      </Container>
    </>
  );
}
