import type { ShiftSessionDetail } from '@pos-tercos/types';
import { ShiftCloseAiButton } from '../../ai-insights';
import { ShiftCashSection } from './ShiftCashSection';
import { ShiftDigitalCountSection } from './ShiftDigitalCountSection';
import { ShiftSessionBreakdowns } from './ShiftSessionBreakdowns';
import { ShiftSessionHeader } from './ShiftSessionHeader';
import { ShiftSessionOrdersTable } from './ShiftSessionOrdersTable';
import { ShiftSessionSummary } from './ShiftSessionSummary';

export function ShiftSessionDetailView({ detail }: { detail: ShiftSessionDetail }) {
  const { shift, summary, orders } = detail;
  const isClosed = shift.status === 'CLOSED';

  return (
    <div className="space-y-6">
      <ShiftSessionHeader shift={shift} />

      {/* Asistente de cierre (IA) — solo para cajas cerradas. */}
      {isClosed ? <ShiftCloseAiButton shiftId={shift.id} /> : null}

      <ShiftSessionSummary summary={summary} />

      <ShiftSessionBreakdowns summary={summary} />

      <ShiftCashSection
        cashMovements={detail.cashMovements}
        cashCountBreakdown={detail.cashCountBreakdown}
      />

      <ShiftDigitalCountSection breakdown={detail.digitalCountBreakdown} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Pedidos de la sesión ({orders.length})
        </h2>
        <ShiftSessionOrdersTable orders={orders} />
      </section>
    </div>
  );
}
