'use client';

import type { FinancePendingFixedCost, FixedCost } from '@pos-tercos/types';
import { Receipt, Repeat } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { listFixedCosts, listPendingFixedCosts } from '../api/client';
import { partirCostos } from '../lib/particion';
import { CostsSectionHeader } from './CostsSectionHeader';
import { CostsSummaryCard } from './CostsSummaryCard';
import { DeleteFixedCostDialog } from './DeleteFixedCostDialog';
import { FixedCostFormDialog } from './FixedCostFormDialog';
import { FixedCostPaymentDialog } from './FixedCostPaymentDialog';
import { FixedCostsTable } from './FixedCostsTable';
import { PendingPeriodsPanel } from './PendingPeriodsPanel';

interface Props {
  costs: FixedCost[];
  /** Períodos pendientes por pagar (del backend). Habilitan el botón "Pagar". */
  pending: FinancePendingFixedCost[];
}

type Modal =
  | { kind: 'new' }
  | { kind: 'edit'; cost: FixedCost }
  | { kind: 'delete'; cost: FixedCost }
  | { kind: 'pay'; period: FinancePendingFixedCost }
  | null;

export function FixedCostsManager({ costs: initialCosts, pending: initialPending }: Props) {
  const router = useRouter();
  const [costs, setCosts] = useState(initialCosts);
  const [pending, setPending] = useState(initialPending);
  const [modal, setModal] = useState<Modal>(null);

  const close = (): void => setModal(null);
  // Tras cualquier cambio (pago/edición/creación/borrado) re-consulta catálogo
  // + períodos y actualiza la vista. El estado cliente es la fuente de verdad
  // de esta página — router.refresh() no repinta el server component de forma
  // fiable en dev, así que se refetchea explícito (con fallback a refresh).
  const onSaved = async (): Promise<void> => {
    close();
    try {
      const [freshCosts, freshPending] = await Promise.all([
        listFixedCosts(),
        listPendingFixedCosts(),
      ]);
      setCosts(freshCosts);
      setPending(freshPending);
    } catch {
      router.refresh();
    }
  };

  // Los dos grupos se separan en pantalla porque son plata de naturaleza
  // distinta: lo recurrente sostiene el negocio mes a mes (y es lo que entra al
  // punto de equilibrio); lo único es un gasto suelto que no vuelve.
  const {
    recurrentes,
    unicos,
    totalRecurrenteMensual,
    totalUnicos,
    recurrentesActivos,
    unicosActivos,
  } = partirCostos(costs);

  return (
    <div className="space-y-6">
      <CostsSummaryCard
        totalRecurrenteMensual={totalRecurrenteMensual}
        recurrentesActivos={recurrentesActivos}
        totalUnicos={totalUnicos}
        unicosActivos={unicosActivos}
        onCreate={() => setModal({ kind: 'new' })}
      />

      <section className="space-y-3">
        <CostsSectionHeader
          icon={Repeat}
          title="Gastos recurrentes"
          hint="Se repiten solos: arriendo, servicios, internet, software, contador. Son pocos y sostienen el negocio todos los meses."
          count={recurrentes.length}
          total={totalRecurrenteMensual}
          totalLabel="Al mes"
        />
        <FixedCostsTable
          costs={recurrentes}
          variant="recurring"
          onCreate={() => setModal({ kind: 'new' })}
          onEdit={(cost) => setModal({ kind: 'edit', cost })}
          onDelete={(cost) => setModal({ kind: 'delete', cost })}
        />
      </section>

      <section className="space-y-3">
        <CostsSectionHeader
          icon={Receipt}
          title="Gastos únicos"
          hint="Pasan una sola vez: aceite, productos de aseo, una reparación, una compra puntual. Cada uno pesa solo en el mes de su fecha."
          count={unicos.length}
          total={totalUnicos}
          totalLabel="Total"
        />
        <FixedCostsTable
          costs={unicos}
          variant="oneTime"
          onCreate={() => setModal({ kind: 'new' })}
          onEdit={(cost) => setModal({ kind: 'edit', cost })}
          onDelete={(cost) => setModal({ kind: 'delete', cost })}
        />
      </section>

      <PendingPeriodsPanel
        costs={costs}
        pending={pending}
        onPay={(period) => setModal({ kind: 'pay', period })}
      />

      {(modal?.kind === 'new' || modal?.kind === 'edit') && (
        <FixedCostFormDialog
          initial={modal.kind === 'edit' ? modal.cost : null}
          onClose={close}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteFixedCostDialog cost={modal.cost} onClose={close} onSuccess={onSaved} />
      )}
      {modal?.kind === 'pay' && (
        <FixedCostPaymentDialog
          fixedCostId={modal.period.fixedCostId}
          fixedCostName={modal.period.name}
          expectedAmount={modal.period.amount}
          periodYear={modal.period.periodYear}
          periodMonth={modal.period.periodMonth}
          periodLabel={modal.period.periodLabel}
          onClose={close}
          onSuccess={onSaved}
        />
      )}
    </div>
  );
}
