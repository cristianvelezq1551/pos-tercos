import type { PayrollPeriodReport } from '@pos-tercos/types';
import {
  DataTable,
  EmptyState,
  Money,
  Quantity,
  StatCard,
  formatCop,
  formatNumber,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';

type PayrollEntry = PayrollPeriodReport['entries'][number];

interface PayrollPeriodTableProps {
  report: PayrollPeriodReport;
}

export function PayrollPeriodTable({ report }: PayrollPeriodTableProps) {
  const totalHours = report.entries.reduce((s, e) => s + e.totalHours, 0);
  const totalCommission = report.entries.reduce((s, e) => s + e.estimatedCommission, 0);

  if (report.entries.length === 0) {
    return (
      <EmptyState
        illustration={<LineArtIllustration name="closed-shift" />}
        title="Sin asistencia en el período"
        description={`${report.periodFrom} → ${report.periodTo}`}
      />
    );
  }

  const columns: DataTableColumn<PayrollEntry>[] = [
    {
      key: 'worker',
      header: 'Trabajador',
      cell: (e) => <span className="font-medium text-foreground">{e.userFullName}</span>,
    },
    {
      key: 'role',
      header: 'Rol',
      hideOnMobile: true,
      cell: (e) => <span className="text-xs text-muted-foreground">{e.userRole}</span>,
    },
    {
      key: 'days',
      header: 'Días',
      align: 'right',
      numeric: true,
      cell: (e) => e.attendanceDays,
    },
    {
      key: 'hours',
      header: 'Horas',
      align: 'right',
      numeric: true,
      cell: (e) => <Quantity value={e.totalHours} decimals={2} />,
    },
    {
      key: 'commission-config',
      header: 'Comisión vigente',
      hideOnMobile: true,
      cell: (e) =>
        e.activeCommission ? (
          <span className="text-xs text-foreground">
            {e.activeCommission.type === 'PERCENT_OF_SHIFT' &&
            e.activeCommission.percent !== null
              ? `${formatNumber(e.activeCommission.percent * 100, { decimals: 2 })}% turno`
              : e.activeCommission.fixedAmount !== null
                ? `${formatCop(e.activeCommission.fixedAmount)} / venta`
                : '—'}
          </span>
        ) : (
          <span className="text-xs text-ink-400">sin config</span>
        ),
    },
    {
      key: 'commission-est',
      header: 'Comisión est.',
      align: 'right',
      numeric: true,
      cell: (e) =>
        e.estimatedCommission > 0 ? (
          <span className="text-success">
            <Money amount={e.estimatedCommission} weight="semibold" className="text-current" />
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Período"
          value={
            <span className="text-base font-semibold text-foreground">
              {report.periodFrom} → {report.periodTo}
            </span>
          }
        />
        <StatCard label="Total horas" value={<Quantity value={totalHours} decimals={1} />} />
        <StatCard
          label="Comisiones est."
          value={<Money amount={totalCommission} size="2xl" weight="bold" />}
          tone="success"
        />
      </section>

      <DataTable
        rows={report.entries}
        rowKey={(e) => e.userId}
        columns={columns}
        emptyState={null}
      />

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-[0.6875rem] text-muted-foreground">
        Comisión calculada solo para CAJERO con configuración vigente y shifts cerrados en el período.
      </p>
    </div>
  );
}
