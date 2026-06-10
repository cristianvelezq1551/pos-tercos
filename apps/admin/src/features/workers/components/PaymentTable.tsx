'use client';

import type { PagoReport } from '@pos-tercos/types';
import { Badge, DataTable, EmptyState, Money, StatCard, type DataTableColumn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { PAY_TYPE_LABEL, roleLabel } from '../lib/format';

type Entry = PagoReport['entries'][number];

/** Vista de cierre del sub-pago: lista los empleados con su monto y el estado
 *  del pago (Pendiente/Pagado/Cancelado). Es solo lectura — para marcar pagado
 *  (con comprobante) hay que entrar al panel del empleado, así cada acción
 *  queda en el contexto de su detalle del mes. */
export function PaymentTable({ report }: { report: PagoReport }) {
  if (report.entries.length === 0) {
    return (
      <EmptyState
        illustration={<LineArtIllustration name="closed-shift" />}
        title="Nadie en nómina este pago"
        description="asigna tipo de pago y salario a los empleados (en Usuarios) para que aparezcan aquí."
      />
    );
  }

  const columns: DataTableColumn<Entry>[] = [
    {
      key: 'worker',
      header: 'Empleado',
      cell: (e) => (
        <Link href={`/workers/${e.userId}`} className="flex min-w-0 flex-col hover:underline">
          <span className="font-medium text-primary">{e.userFullName}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(e.userRole)}</span>
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Pago',
      hideOnMobile: true,
      cell: (e) =>
        e.payType ? (
          <Badge tone={e.payType === 'MONTHLY' ? 'info' : 'neutral'} size="sm">
            {PAY_TYPE_LABEL[e.payType]}
          </Badge>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'days',
      header: 'Días',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (e) => (e.payType === 'DAILY' ? e.daysWorked : e.daysEmployed),
    },
    {
      key: 'base',
      header: 'Base',
      align: 'right',
      numeric: true,
      cell: (e) => <Money amount={e.base} />,
    },
    {
      key: 'adj',
      header: 'Novedades',
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: (e) =>
        e.adjustmentsTotal !== 0 ? (
          <Money amount={e.adjustmentsTotal} className={e.adjustmentsTotal < 0 ? 'text-destructive' : 'text-success'} />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'total',
      header: 'A pagar',
      align: 'right',
      numeric: true,
      cell: (e) => <Money amount={e.total} weight="semibold" />,
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (e) => {
        if (!e.payment) {
          return <Badge tone="neutral" size="sm">Pendiente</Badge>;
        }
        return e.payment.status === 'PAID' ? (
          <Badge tone="success" size="sm">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Pagado
          </Badge>
        ) : (
          <Badge tone="danger" size="sm" title={e.payment.note ?? undefined}>
            <XCircle className="mr-1 h-3 w-3" /> Cancelado
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Pago"
          value={<span className="text-base font-semibold text-foreground">{report.periodLabel}</span>}
        />
        <StatCard label="Empleados" value={String(report.entries.length)} />
        <StatCard
          label="Total a pagar"
          value={<Money amount={report.totalPay} size="2xl" weight="bold" />}
          tone="success"
        />
      </section>

      <DataTable rows={report.entries} rowKey={(e) => e.userId} columns={columns} emptyState={null} />

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-[0.6875rem] text-muted-foreground">
        Mensual: salario ÷ 4 por sub-pago (constante; 4 sub-pagos por mes = salario). Diario: suma
        de los días trabajados del sub-pago (los descansos cíclicos no se pagan).{' '}
        <strong className="text-foreground">Tocá un empleado</strong> para ver su detalle del mes y
        marcar el pago con comprobante.
      </p>
    </div>
  );
}
