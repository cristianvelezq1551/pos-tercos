'use client';

import type { FixedCost } from '@pos-tercos/types';
import { Button, formatCop } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeleteFixedCostDialog } from './DeleteFixedCostDialog';
import { FixedCostFormDialog } from './FixedCostFormDialog';
import { FixedCostsTable } from './FixedCostsTable';

interface Props {
  costs: FixedCost[];
}

type Modal =
  | { kind: 'new' }
  | { kind: 'edit'; cost: FixedCost }
  | { kind: 'delete'; cost: FixedCost }
  | null;

export function FixedCostsManager({ costs }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);

  const close = (): void => setModal(null);
  const onSaved = (): void => {
    close();
    router.refresh();
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
    </div>
  );
}
