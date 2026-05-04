import type { WhatsAppMetrics } from '@pos-tercos/types';
import { formatNumber } from '../../../lib/format';

const STAGE_LABEL: Record<string, string> = {
  accepted: 'Aceptar y contactar',
  confirmed: 'Pago confirmado',
  ready: 'Pedido listo',
};

const STAGE_DESC: Record<string, string> = {
  accepted: 'Cajero acepta + abre WhatsApp para pedir comprobante.',
  confirmed: 'Post confirmar pago abre WhatsApp con "ya está en cocina".',
  ready: 'Cocinero marca listo + abre WhatsApp con "listo para retirar".',
};

export function WhatsAppMetricsCard({ metrics }: { metrics: WhatsAppMetrics }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Cobertura WhatsApp
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          {metrics.totalWebSales} pedido{metrics.totalWebSales === 1 ? '' : 's'} web en
          el período. Cobertura = sales únicas con click registrado /
          sales elegibles para ese stage.
        </p>
      </div>
      <div className="space-y-4">
        {metrics.stages.map((s) => {
          const pct = s.coveragePct === null ? null : s.coveragePct * 100;
          const tone = pct === null
            ? 'bg-gray-200'
            : pct >= 80
              ? 'bg-emerald-500'
              : pct >= 50
                ? 'bg-amber-500'
                : 'bg-red-500';
          return (
            <div key={s.stage}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {STAGE_LABEL[s.stage]}
                </span>
                <span className="text-sm tabular-nums">
                  {pct === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <span className="font-semibold">
                      {formatNumber(pct, { decimals: 1 })}%
                    </span>
                  )}
                  <span className="ml-2 text-xs text-gray-500">
                    {s.reached}/{s.eligible}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-100">
                {pct !== null && (
                  <div
                    className={`h-full rounded-full ${tone}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {STAGE_DESC[s.stage]}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
