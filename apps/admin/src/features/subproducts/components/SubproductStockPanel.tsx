import type { InventoryMovement, Stockable, Subproduct } from '@pos-tercos/types';
import { Badge, BUSINESS_TIME_ZONE, formatNumber, pluralizeUnit, Quantity } from '@pos-tercos/ui';
import Link from 'next/link';
import { ProduceSubproductAction } from './ProduceSubproductAction';

const TYPE_LABEL: Record<InventoryMovement['type'], string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  MANUAL_ADJUSTMENT: 'Ajuste',
  WASTE: 'Merma',
  INITIAL: 'Inicial',
  PRODUCTION: 'Producción',
};

const TYPE_TONE: Record<
  InventoryMovement['type'],
  'success' | 'danger' | 'primary' | 'warning' | 'neutral' | 'info'
> = {
  PURCHASE: 'success',
  SALE: 'danger',
  MANUAL_ADJUSTMENT: 'primary',
  WASTE: 'warning',
  INITIAL: 'neutral',
  PRODUCTION: 'info',
};

/**
 * Panel de stock del subproducto: stock actual + umbral + acción "Producir"
 * + últimos movimientos. Server component (recibe data ya cargada).
 */
export function SubproductStockPanel({
  subproduct,
  stock,
  movements,
  canProduce,
}: {
  subproduct: Subproduct;
  /** Stockable del subproducto (puede ser null si nunca tuvo movements). */
  stock: Stockable | null;
  /** Últimos N movimientos del subproducto (server-fetched). */
  movements: InventoryMovement[];
  canProduce: boolean;
}) {
  const current = stock?.currentStock ?? 0;
  const threshold = Number(subproduct.thresholdMin);
  const low = subproduct.isActive && current < threshold;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Inventario de producción
            </h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-3xl font-bold tabular-nums text-foreground">
                {formatNumber(current, { maxDecimals: 2 })}
              </span>
              <span className="text-sm text-muted-foreground">
                {pluralizeUnit(subproduct.unit, current)}
              </span>
              {low ? (
                <Badge tone="warning" size="sm">
                  Falta producir
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {threshold > 0
                ? `Umbral mínimo: ${formatNumber(threshold, { maxDecimals: 2 })} ${pluralizeUnit(subproduct.unit, threshold)}`
                : 'Sin umbral mínimo configurado.'}
            </p>
          </div>
          {canProduce && subproduct.isActive ? (
            <ProduceSubproductAction
              subproductId={subproduct.id}
              name={subproduct.name}
              unit={subproduct.unit}
              yieldValue={subproduct.yield}
              variant="full"
            />
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Movimientos recientes
          </h3>
          <Link
            href={`/inventory/movements?subproduct_id=${subproduct.id}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos →
          </Link>
        </div>
        {movements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Sin movimientos todavía. Produce una tanda para empezar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={TYPE_TONE[m.type]} size="sm">
                      {TYPE_LABEL[m.type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString('es-CO', {
                        timeZone: BUSINESS_TIME_ZONE,
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {m.notes ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.notes}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 font-medium tabular-nums ${m.delta > 0 ? 'text-success' : 'text-destructive'}`}
                >
                  {m.delta > 0 ? '+' : ''}
                  <Quantity value={m.delta} maxDecimals={2} />
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {pluralizeUnit(subproduct.unit, m.delta)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
