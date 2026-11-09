import { Container, PageHeader } from '@pos-tercos/ui';
import { Coins } from 'lucide-react';
import { FixedCostsManager } from '../../../../features/fixed-costs';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import { requireRole } from '../../../../lib/guards';
import { businessWallClock, type FinancePendingFixedCost, type FixedCost } from '@pos-tercos/types';

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

  // El mes que se abre por defecto lo decide la hora del LOCAL: esta página se
  // arma en el servidor (UTC), donde el último día del mes después de las 7 pm
  // ya es el mes siguiente.
  const now = businessWallClock();
  const currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

  return (
    <>
      <PageHeader
        eyebrow="Finanzas"
        title="Costos y gastos"
        description="Separados en dos: los RECURRENTES, que se repiten solos cada mes o cada año (arriendo, servicios, software, contador), y los ÚNICOS, que pasan una vez y se ven mes a mes, cada uno en el mes de su fecha (aceite, aseo, una reparación). La nómina NO va aquí — se jala automática del módulo de Nómina."
        icon={<Coins className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        {Array.isArray(costs) ? (
          <FixedCostsManager costs={costs} pending={pending} currentMonth={currentMonth} />
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
