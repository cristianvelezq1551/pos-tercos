'use client';

import type { FinancePendingPayable } from '@pos-tercos/types';
import { Button, Money } from '@pos-tercos/ui';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
// Import directo (no por el barrel): el barrel de payables re-exporta
// getPayablesServer (next/headers), que rompería este componente cliente.
import { PayPayableModal } from '../../payables/components/PayPayableModal';
import { EmptyHint } from './EmptyHint';

export function PendingPayablesCard({
  rows,
  onChanged,
}: {
  rows: FinancePendingPayable[];
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<FinancePendingPayable | null>(null);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Compromisos por pagar</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin compromisos pendientes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.beneficiary}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money amount={r.amount} weight="semibold" />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setTarget(r)}
                    title="Marcar pagado"
                    aria-label="Marcar pagado"
                    className="-my-1 h-7 px-2"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {target ? (
        <PayPayableModal
          payable={target}
          onClose={() => setTarget(null)}
          onSuccess={() => {
            setTarget(null);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
