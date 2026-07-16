'use client';

import type { FinancePendingFixedCost, FixedCost } from '@pos-tercos/types';
import { Button, formatCop } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { listFixedCosts, listPendingFixedCosts } from '../api/client';
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

  const totalMensual = costs
    .filter((c) => c.isActive)
    .reduce(
      (acc, c) => acc + (c.frequency === 'ANNUAL' ? c.amount / 12 : c.amount),
      0,
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="caps text-[0.625rem] text-muted-foreground">Total mensual estimado</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{formatCop(totalMensual)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Suma de costos activos en su equivalente mensual (anuales ÷ 12). La nómina se suma
            aparte automáticamente en el estado financiero.
          </p>
        </div>
        <Button onClick={() => setModal({ kind: 'new' })}>
          <Plus className="h-4 w-4" /> Nuevo costo fijo
        </Button>
      </div>

      <FixedCostsTable
        costs={costs}
        onCreate={() => setModal({ kind: 'new' })}
        onEdit={(cost) => setModal({ kind: 'edit', cost })}
        onDelete={(cost) => setModal({ kind: 'delete', cost })}
      />

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
