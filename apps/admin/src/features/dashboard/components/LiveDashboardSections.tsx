'use client';

import type { DashboardSummary } from '@pos-tercos/types';
import {
  Card,
  Money,
  Section,
  StatCard,
  cn,
} from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import {
  AlertTriangle,
  ArrowUpRight,
  ChefHat,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getDashboardSummary } from '../api/client';

const POLL_MS = 15_000;

/**
 * Stats del día + pedidos web en vivo. Se hidrata con el snapshot SSR y luego se
 * autoactualiza cada 15s vía polling al endpoint del dashboard, MÁS un refresco
 * inmediato al volver el foco/pestaña (así una venta del cajero aparece apenas
 * el dueño mira la pantalla, sin esperar el próximo tick). Soft-update: no
 * remonta las cards, solo cambia los números, para evitar parpadeos.
 */
export function LiveDashboardSections({ initial }: { initial: DashboardSummary }) {
  const [summary, setSummary] = useState<DashboardSummary>(initial);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [stale, setStale] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    // Saltamos el primer fetch — ya tenemos `initial` desde SSR.
    if (firstRender.current) {
      firstRender.current = false;
    }

    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const data = await getDashboardSummary();
        if (!cancelled) {
          setSummary(data);
          setUpdatedAt(new Date());
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    };

    const id = window.setInterval(tick, POLL_MS);
    const onFocus = (): void => {
      if (document.visibilityState !== 'hidden') void tick();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return (
    <>
      <Section
        eyebrow="Hoy en números"
        title="Pulso del local"
        size="md"
        actions={
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[0.6875rem]',
                stale ? 'text-warning' : 'text-success',
              )}
              title={`Actualizado: ${updatedAt.toLocaleTimeString('es-CO')}`}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  stale ? 'bg-warning' : 'bg-success animate-pulse',
                )}
              />
              {stale ? 'Reconectando…' : 'En vivo'}
            </span>
            <Link
              href="/reports/sales"
              className="caps inline-flex items-center gap-1 text-[0.6875rem] text-primary hover:underline"
            >
              Ver reporte completo
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </Link>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Ingresos de hoy"
            value={<Money amount={summary.todayRevenue} size="3xl" weight="bold" />}
            delta={
              summary.weekOverWeekPct == null
                ? null
                : Number((summary.weekOverWeekPct * 100).toFixed(1))
            }
            deltaLabel={
              summary.weekOverWeekPct == null ? 'sin datos previos' : 'vs semana pasada'
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
            label="Pedidos web por confirmar"
            value={String(summary.pendingWebOrders)}
            hint="Confirmar pago desde el POS"
            tone={summary.pendingWebOrders > 0 ? 'warning' : 'neutral'}
            icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.75} />}
          />
          <StatCard
            label="Inventario crítico"
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

      <Section eyebrow="Pedidos web" title="En vivo" size="md">
        <div className="grid gap-3 sm:grid-cols-3">
          <KitchenCard
            label="Por marcar listo"
            value={summary.webOrdersToPrepare}
            icon={<ChefHat className="h-5 w-5" strokeWidth={1.75} />}
            tone="warning"
          />
          <KitchenCard
            label="Listos para retirar (hoy)"
            value={summary.webOrdersReady}
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
