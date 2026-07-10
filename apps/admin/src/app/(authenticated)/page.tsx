import { Container, PageHeader, Section, formatDate } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  LineChart,
  TrendingUp,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../lib/api-server';
import { DailyAiSummaryCard } from '../../features/ai-insights';
import { getCurrentUserServer } from '../../features/auth/server';
import { LiveDashboardSections } from '../../features/dashboard';
import { DashboardSummarySchema, type DashboardSummary } from '@pos-tercos/types';

async function loadDashboard(): Promise<DashboardSummary | null> {
  try {
    return await serverFetchJson<DashboardSummary>(
      '/reports/dashboard',
      undefined,
      DashboardSummarySchema,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('[dashboard] api error', err.status, err.body);
    }
    return null;
  }
}

export default async function InicioPage() {
  // El Inicio es Dueño-only: muestra ingresos, descuadres, dashboards
  // financieros. El ADMIN_OPERATIVO no lo ve — aterriza en el launcher `/inicio`
  // donde elige Caja o Gestión (unificación POS+admin, Fase 4).
  const user = await getCurrentUserServer();
  if (!user) redirect('/login');
  if (user.role !== 'DUENO') {
    redirect('/inicio');
  }

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
          <DailyAiSummaryCard />
          {summary ? (
            <LiveDashboardSections initial={summary} />
          ) : (
            <div
              role="alert"
              className="rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning"
            >
              No se pudo cargar el resumen. Verifica que el API esté corriendo.
            </div>
          )}

          {/* CTA principal: Estado financiero del mes — el más importante del día a día. */}
          <Section eyebrow="Finanzas" title="Estado financiero del mes" size="md">
            <Link
              href="/finanzas/estado"
              className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 transition-all duration-150 hover:border-primary hover:bg-primary/10 hover:shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <TrendingUp className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold tracking-tight text-foreground">
                  Ver resultado del mes
                </p>
                <p className="text-xs text-muted-foreground">
                  Ingresos − COGS − nómina − costos fijos = ganancia/pérdida real. Con análisis IA y
                  punto de equilibrio.
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} />
            </Link>
          </Section>

          <Section eyebrow="Profundizar" title="Reportes" size="md">
            <div className="grid gap-3 sm:grid-cols-2">
              <ReportLink
                href="/reports/sales"
                title="Ventas y métodos de pago"
                desc="Cómo vendiste día a día, por tipo de venta y forma de pago"
                icon={<LineChart className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/products"
                title="Productos más vendidos y márgenes"
                desc="Cuánto se vendió de cada producto y cuánto te deja"
                icon={<BarChart3 className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/operations"
                title="Operación: WhatsApp + IA + horarios"
                desc="Cobertura de WhatsApp, datos de la IA y mapa de calor por día y hora"
                icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/anomalies"
                title="Anomalías por cajero"
                desc="Detecta descuadres y anulaciones fuera de lo normal"
                icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
              />
              <ReportLink
                href="/reports/reconciliation"
                title="Conciliación de pagos digitales"
                desc="Cruza los movimientos de Nequi/Bancolombia con tus ventas"
                icon={<ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} />}
              />
            </div>
          </Section>
        </div>
      </Container>
    </>
  );
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
