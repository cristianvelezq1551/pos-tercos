'use client';

import type { FinanceSummary } from '@pos-tercos/types';
import { Money, StatCard, formatCop } from '@pos-tercos/ui';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PaidFixedCostsCard } from './PaidFixedCostsCard';
import { PaidInvoicesCard } from './PaidInvoicesCard';
import { PaidPayrollCard } from './PaidPayrollCard';
import { PendingFixedCostsCard } from './PendingFixedCostsCard';
import { PendingInvoicesCard } from './PendingInvoicesCard';
import { PendingPayrollCard } from './PendingPayrollCard';

/**
 * Cockpit cash-based: 4 cards arriba (ingresos / pagado / pendiente / neto)
 * + secciones de detalle (pendientes por pagar arriba — lo urgente — y
 * pagado este mes abajo — para auditoría).
 *
 * NO duplica el P&G accrual (eso está más abajo en /reports/financial).
 * Acá responde "estoy al día con mis pagos".
 */
export function FinanceCockpit({ summary }: { summary: FinanceSummary }) {
  const router = useRouter();
  const refresh = (): void => router.refresh();
  const isPositiveNet = summary.netCash >= 0;
  return (
    <div className="space-y-8">
      {/* 4 KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ingresos del mes"
          value={<Money amount={summary.revenue} size="2xl" weight="bold" />}
          hint="Ventas pagadas en el mes"
          tone="success"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <StatCard
          label="Pagado este mes"
          value={<Money amount={summary.paid.total} size="2xl" weight="bold" />}
          hint={`Nómina ${formatCop(summary.paid.payroll)} · Proveedores ${formatCop(summary.paid.invoices)} · Fijos ${formatCop(summary.paid.fixedCosts)}`}
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <StatCard
          label="Pendiente por pagar"
          value={<Money amount={summary.pending.total} size="2xl" weight="bold" />}
          hint={`Nómina ${formatCop(summary.pending.payroll)} · Proveedores ${formatCop(summary.pending.invoices)} · Fijos ${formatCop(summary.pending.fixedCosts)}`}
          tone={summary.pending.total > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Neto del mes"
          value={<Money amount={summary.netCash} size="2xl" weight="bold" />}
          hint="Ingresos − pagado (NO incluye pendientes)"
          tone={isPositiveNet ? 'success' : 'danger'}
        />
      </section>

      {/* PENDIENTES (lo urgente) */}
      <section className="space-y-4">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            Pendiente por pagar
          </h2>
          <span className="text-sm text-muted-foreground">
            Total: <Money amount={summary.pending.total} weight="bold" />
          </span>
        </header>
        <p className="text-xs text-muted-foreground">
          Incluye sub-pagos, facturas y costos fijos sin marcar como pagados —{' '}
          <strong className="text-foreground">no se filtra por mes</strong>: si quedó algo
          atrasado de meses anteriores también aparece acá.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <PendingPayrollCard rows={summary.pendingPayroll} />
          <PendingInvoicesCard rows={summary.pendingInvoices} />
          <PendingFixedCostsCard rows={summary.pendingFixedCosts} onChanged={refresh} />
        </div>
      </section>

      {/* PAGADO ESTE MES (auditoría) */}
      <section className="space-y-4">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            Pagado este mes
          </h2>
          <span className="text-sm text-muted-foreground">
            Total: <Money amount={summary.paid.total} weight="bold" />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <PaidPayrollCard rows={summary.paidPayroll} />
          <PaidInvoicesCard rows={summary.paidInvoices} />
          <PaidFixedCostsCard rows={summary.paidFixedCosts} />
        </div>
      </section>
    </div>
  );
}
