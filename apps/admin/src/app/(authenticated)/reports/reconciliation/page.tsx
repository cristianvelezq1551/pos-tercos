import {
  ReconciliationHistory,
  ReconciliationView,
} from '../../../../features/reports';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import type { SavedReconciliation } from '@pos-tercos/types';

async function loadHistory(): Promise<SavedReconciliation[]> {
  try {
    return await serverFetchJson<SavedReconciliation[]>(
      '/reports/payment-reconciliation/history?limit=20',
    );
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('[reconciliation history] api error', err.status, err.body);
    }
    return [];
  }
}

export default async function ReconciliationPage() {
  const history = await loadHistory();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reconciliación de pagos</h1>
        <p className="mt-1 text-sm text-gray-600">
          Subí el extracto CSV de Nequi/Bancolombia. Compara cada transacción contra las
          ventas POS confirmadas como digital. Marca:
        </p>
        <ul className="mt-2 list-disc pl-6 text-sm text-gray-600">
          <li>
            <strong className="text-emerald-700">Match</strong> — CSV row + sale POS
            coinciden por monto + fecha (±24h).
          </li>
          <li>
            <strong className="text-red-700">CSV sin POS</strong> — pago en banco que NO
            aparece en POS (sospechoso: pago de cliente no registrado).
          </li>
          <li>
            <strong className="text-amber-700">POS sin CSV</strong> — venta digital
            confirmada en POS sin txn correspondiente en banco (cajero podría haber
            confirmado sin verificar).
          </li>
        </ul>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Importar nuevo CSV
        </h2>
        <ReconciliationView />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Histórico (últimos 20)
        </h2>
        <ReconciliationHistory reports={history} />
      </section>
    </div>
  );
}
