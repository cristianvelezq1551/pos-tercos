'use client';

import { comprobantesDe, type FinancePaidFixedCost } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { PocketBadge } from '../../../components/PocketBadge';
import { FixedCostProofsDialog } from '../../fixed-costs';
import { EmptyHint } from './EmptyHint';
import { formatShortDate } from './format-short-date';

export function PaidFixedCostsCard({ rows }: { rows: FinancePaidFixedCost[] }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const [abierto, setAbierto] = useState<FinancePaidFixedCost | null>(null);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Costos fijos pagados</h3>
        <Money amount={total} weight="bold" />
      </header>
      {rows.length === 0 ? (
        <EmptyHint text="Sin pagos de costos fijos registrados este mes." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const comprobantes = comprobantesDe(r);
            return (
              <li key={r.paymentId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={r.name}>
                    {r.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="truncate"
                      title={`${r.periodLabel.replace(`${r.name} · `, '')} · pagado ${formatShortDate(r.paidAt)}`}
                    >
                      {r.periodLabel.replace(`${r.name} · `, '')} · pagado {formatShortDate(r.paidAt)}
                    </span>
                    <PocketBadge pago={r} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money amount={r.amount} weight="semibold" />
                  {r.hasProof ? (
                    <button
                      type="button"
                      onClick={() => setAbierto(r)}
                      title={comprobantes > 1 ? `Ver ${comprobantes} comprobantes` : 'Ver comprobante'}
                      aria-label={`Ver los comprobantes de ${r.name}`}
                      className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Paperclip className="h-3 w-3" strokeWidth={2} />
                      {comprobantes > 1 ? comprobantes : null}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {abierto ? (
        <FixedCostProofsDialog
          paymentId={abierto.paymentId}
          title="Comprobante del costo fijo"
          description={`${abierto.name} · ${abierto.periodLabel.replace(`${abierto.name} · `, '')}`}
          initialCount={comprobantesDe(abierto)}
          onClose={() => setAbierto(null)}
        />
      ) : null}
    </section>
  );
}
