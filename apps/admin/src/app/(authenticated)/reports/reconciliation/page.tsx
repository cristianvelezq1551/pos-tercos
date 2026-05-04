import { ReconciliationView } from '../../../../features/reports';

export default function ReconciliationPage() {
  return (
    <div className="space-y-6">
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
      <ReconciliationView />
    </div>
  );
}
