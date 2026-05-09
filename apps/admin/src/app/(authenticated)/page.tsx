import {
  Card,
  Container,
  Money,
  PageHeader,
  Section,
  StatCard,
  formatDate,
} from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  ChefHat,
  LineChart,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import { ApiError, serverFetchJson } from '../../lib/api-server';
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

export default async function InicioPage() {
  const summary = await loadDashboard();
  const today = summary ? formatDate(summary.date, 'long') : null;

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Inicio"
        description={
          summary ? `Resumen del día — ${today}` : 'No se pudo cargar el resumen.'
        }
        icon={<BrandIcon name="flame" className="h-6 w-6" />}
      />

      <Container size="7xl" padY="md">
        <div className="space-y-10">
          {summary ? (
            <>
              <Section
                eyebrow="Hoy en números"
                title="Pulso del local"
                size="md"
                actions={
                  <Link
                    href="/reports/sales"
                    className="caps inline-flex items-center gap-1 text-[0.6875rem] text-primary hover:underline"
                  >
                    Ver reporte completo
                    <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
                  </Link>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Revenue de hoy"
                    value={<Money amount={summary.todayRevenue} size="3xl" weight="bold" />}
                    delta={
                      summary.weekOverWeekPct == null
                        ? null
                        : Number((summary.weekOverWeekPct * 100).toFixed(1))
                    }
                    deltaLabel={
                      summary.weekOverWeekPct == null ? 'sin datos previos' : 'vs hace 7 días'
                    }
                    icon={<BrandIcon name="flame" className="h-5 w-5" />}
                    tone="primary"
                  />
                  <StatCard
                    label="Ventas hoy"
                    value={String(summary.todayCount)}
                    hint={
                      <>
                        Descuentos:{' '}
                        <Money amount={summary.todayDiscount} size="xs" weight="medium" />
                      </>
                    }
                    icon={<BrandIcon name="burger" className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Pedidos web por aceptar"
                    value={String(summary.pendingWebOrders)}
                    hint="Aceptar y contactar desde POS"
                    tone={summary.pendingWebOrders > 0 ? 'warning' : 'neutral'}
                    icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.75} />}
                  />
                  <StatCard
                    label="Stock crítico"
                    value={String(summary.lowStockCount)}
                    hint={
                      summary.pendingSuggestions > 0
                        ? `${summary.pendingSuggestions} sugerencias IA esperando`
                        : 'sin sugerencias pendientes'
                    }
                    tone={summary.lowStockCount > 0 ? 'warning' : 'neutral'}
                    icon={<PackageCheck className="h-5 w-5" strokeWidth={1.75} />}
                  />
                </div>
              </Section>

              <Section eyebrow="Cocina" title="En vivo" size="md">
                <div className="grid gap-3 sm:grid-cols-3">
                  <KitchenCard
                    label="En cocina"
                    value={summary.ordersInKitchen}
                    icon={<ChefHat className="h-5 w-5" strokeWidth={1.75} />}
                    tone="warning"
                  />
                  <KitchenCard
                    label="Listos para entregar"
                    value={summary.ordersReady}
                    icon={<BrandIcon name="flame" className="h-5 w-5" />}
                    tone="success"
                  />
                  <KitchenCard
                    label="Sugerencias pendientes"
                    value={summary.pendingSuggestions}
                    icon={<Sparkles className="h-5 w-5" strokeWidth={1.75} />}
                    href="/purchase-suggestions"
                  />
                </div>
              </Section>
            </>
          ) : (
            <div
              role="alert"
              className="rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning"
            >
              No se pudo cargar el resumen. Verifica que el API esté corriendo.
            </div>
          )}

          <Section eyebrow="Profundizar" title="Reportes" size="md">
            <div className="grid gap-3 sm:grid-cols-2">
              <ReportLink
                href="/reports/sales"
                title="Ventas y métodos de pago"
                desc="Serie temporal, breakdown por tipo y método"
                icon={<LineChart className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/products"
                title="Top productos y márgenes"
                desc="Qty, revenue y margen estimado por receta"
                icon={<BarChart3 className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/operations"
                title="Operación: WhatsApp + IA + horarios"
                desc="Cobertura WA, métricas IA, heatmap día/hora"
                icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/anomalies"
                title="Anomalías por cajero"
                desc="Detección 2σ de descuadres y voids"
                icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/reconciliation"
                title="Reconciliación CSV pagos"
                desc="Match Nequi/Bancolombia vs sales digitales"
                icon={<ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} />}
              />
            </div>
          </Section>
        </div>
      </Container>
    </>
  );
}

function KitchenCard({
  label,
  value,
  icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: 'success' | 'warning' | 'primary';
  href?: string;
}) {
  const variant = tone === 'warning' ? 'accent' : 'default';
  const inner = (
    <Card
      variant={variant}
      tone={tone === 'warning' ? 'warning' : tone === 'success' ? 'success' : 'none'}
      className="px-5 py-4"
      interactive={Boolean(href)}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {label}
        </span>
        <span className="font-display text-3xl font-extrabold tabular tracking-tight text-foreground">
          {value}
        </span>
      </div>
    </Card>
  );
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

function ReportLink({
  href,
  title,
  desc,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-ink-300 hover:bg-muted/40 hover:shadow-sm motion-reduce:hover:translate-y-0"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-ink-700 transition-colors group-hover:border-primary group-hover:text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold tracking-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowUpRight
        className="mt-1 h-4 w-4 shrink-0 text-ink-400 transition-colors group-hover:text-primary"
        strokeWidth={1.75}
      />
    </Link>
  );
}
