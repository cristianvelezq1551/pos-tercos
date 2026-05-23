import type { WhatsAppMetrics } from '@pos-tercos/types';
import { formatNumber } from '../../../lib/format';

const STAGE_LABEL: Record<string, string> = {
  accepted: 'Aceptar y contactar',
  confirmed: 'Pago confirmado',
  ready: 'Pedido listo',
};

const STAGE_DESC: Record<string, string> = {
  accepted: 'Cajero acepta el pedido → se envía WhatsApp con instrucciones de pago.',
  confirmed: 'Al confirmar el pago → WhatsApp "ya está en cocina".',
  ready: 'Cocinero marca listo → WhatsApp "listo para retirar".',
};

export function WhatsAppMetricsCard({ metrics }: { metrics: WhatsAppMetrics }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cobertura WhatsApp
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {metrics.totalWebSales} pedido{metrics.totalWebSales === 1 ? '' : 's'} web en
          el período. Cobertura = pedidos con WhatsApp enviado /
          pedidos elegibles para ese stage.
        </p>
      </div>
      <div className="space-y-4">
        {metrics.stages.map((s) => {
          const pct = s.coveragePct === null ? null : s.coveragePct * 100;
          const tone = pct === null
            ? 'bg-ink-700'
            : pct >= 80
              ? 'bg-success'
              : pct >= 50
                ? 'bg-warning'
                : 'bg-destructive';
          return (
            <div key={s.stage}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-foreground">
                  {STAGE_LABEL[s.stage]}
                </span>
                <span className="text-sm tabular-nums">
                  {pct === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="font-semibold">
                      {formatNumber(pct, { decimals: 1 })}%
                    </span>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.reached}/{s.eligible}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                {pct !== null && (
                  <div
                    className={`h-full rounded-full ${tone}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {STAGE_DESC[s.stage]}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
