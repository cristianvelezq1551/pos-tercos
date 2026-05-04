import Link from 'next/link';
import { ApiError, serverFetchJson } from '../../lib/api-server';
import { formatCop } from '../../lib/format';
import type { DashboardSummary } from '@pos-tercos/types';

async function loadDashboard(): Promise<DashboardSummary | null> {
  try {
    return await serverFetchJson<DashboardSummary>('/reports/dashboard');
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('[dashboard] api error', err.status, err.body);
    }
    return null;
  }
}

export default async function DashboardPage() {
  const summary = await loadDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Resumen del día — {summary ? new Date(summary.date).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) : 'cargando…'}
        </p>
      </div>

      {summary ? (
        <>
          {/* Tarjetas: revenue / count / pendientes / stock */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Revenue de hoy"
              value={formatCop(summary.todayRevenue)}
              hint={
                summary.weekOverWeekPct === null
                  ? 'sin sample semana pasada'
                  : `${summary.weekOverWeekPct >= 0 ? '+' : ''}${(summary.weekOverWeekPct * 100).toFixed(1)}% vs hace 7 días`
              }
              hintTone={
                summary.weekOverWeekPct === null
                  ? 'muted'
                  : summary.weekOverWeekPct >= 0
                    ? 'positive'
                    : 'negative'
              }
              href="/reports/sales"
            />
            <StatCard
              label="Ventas hoy"
              value={String(summary.todayCount)}
              hint={`Descuentos: ${formatCop(summary.todayDiscount)}`}
              href="/reports/sales"
            />
            <StatCard
              label="Pedidos web por aceptar"
              value={String(summary.pendingWebOrders)}
              tone={summary.pendingWebOrders > 0 ? 'warning' : 'default'}
              hint="Aceptar y contactar desde POS"
            />
            <StatCard
              label="Stock crítico"
              value={String(summary.lowStockCount)}
              tone={summary.lowStockCount > 0 ? 'warning' : 'default'}
              hint={
                summary.pendingSuggestions > 0
                  ? `${summary.pendingSuggestions} sugerencias IA esperando`
                  : 'sin sugerencias pendientes'
              }
              href="/purchase-suggestions"
            />
          </div>

          {/* Tarjetas operación */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SmallCard
              label="En cocina"
              value={summary.ordersInKitchen}
              tone="blue"
            />
            <SmallCard
              label="Listos para entregar"
              value={summary.ordersReady}
              tone="emerald"
            />
            <SmallCard
              label="Sugerencias pendientes"
              value={summary.pendingSuggestions}
              tone="purple"
              href="/purchase-suggestions"
            />
          </div>
        </>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudo cargar el resumen. Verificá que el API esté corriendo.
        </p>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Reportes
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ReportLink href="/reports/sales" title="Ventas y métodos de pago" desc="Serie temporal, breakdown por tipo y método" />
          <ReportLink href="/reports/products" title="Top productos y márgenes" desc="Qty, revenue y margen estimado por receta" />
          <ReportLink href="/reports/operations" title="Operación: WhatsApp + IA + horarios" desc="Cobertura WA, métricas IA, heatmap día/hora" />
          <ReportLink href="/reports/anomalies" title="Anomalías por cajero" desc="Detección 2σ de descuadres y voids" />
          <ReportLink href="/reports/reconciliation" title="Reconciliación CSV pagos" desc="Match Nequi/Bancolombia vs sales digitales" />
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  tone = 'default',
  hint,
  hintTone = 'muted',
}: {
  label: string;
  value: string;
  href?: string;
  tone?: 'default' | 'warning';
  hint?: string;
  hintTone?: 'muted' | 'positive' | 'negative';
}) {
  const valueClass = tone === 'warning' ? 'text-amber-600' : 'text-gray-900';
  const hintClass =
    hintTone === 'positive'
      ? 'text-emerald-600'
      : hintTone === 'negative'
        ? 'text-red-600'
        : 'text-gray-500';
  const cardClass =
    'block rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30';
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

function SmallCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: 'blue' | 'emerald' | 'purple';
  href?: string;
}) {
  const cls = {
    blue: 'bg-blue-50 text-blue-900 ring-blue-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    purple: 'bg-purple-50 text-purple-900 ring-purple-200',
  }[tone];
  const base = `flex items-center justify-between rounded-lg p-4 ring-1 ring-inset ${cls}`;
  const inner = (
    <>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${base} hover:opacity-80`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

function ReportLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-gray-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
      >
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-600">{desc}</p>
      </Link>
    </li>
  );
}
