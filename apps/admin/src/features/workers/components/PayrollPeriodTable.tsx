import type { PayrollPeriodReport } from '@pos-tercos/types';
import { formatCop, formatNumber } from '../../../lib/format';

interface PayrollPeriodTableProps {
  report: PayrollPeriodReport;
}

export function PayrollPeriodTable({ report }: PayrollPeriodTableProps) {
  if (report.entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        Sin asistencia en el período {report.periodFrom} → {report.periodTo}.
      </p>
    );
  }

  const totalHours = report.entries.reduce((s, e) => s + e.totalHours, 0);
  const totalCommission = report.entries.reduce(
    (s, e) => s + e.estimatedCommission,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Período" value={`${report.periodFrom} → ${report.periodTo}`} />
        <Stat label="Total horas" value={formatNumber(totalHours, { decimals: 1 })} />
        <Stat label="Comisiones est." value={formatCop(totalCommission)} />
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Trabajador</Th>
              <Th>Rol</Th>
              <Th align="right">Días</Th>
              <Th align="right">Horas</Th>
              <Th>Comisión vigente</Th>
              <Th align="right">Comisión est.</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.entries.map((e) => (
              <tr key={e.userId}>
                <Td>{e.userFullName}</Td>
                <Td><span className="text-xs text-gray-600">{e.userRole}</span></Td>
                <Td mono align="right">{e.attendanceDays}</Td>
                <Td mono align="right">{formatNumber(e.totalHours, { decimals: 2 })}</Td>
                <Td>
                  {e.activeCommission ? (
                    <span className="text-xs text-gray-700">
                      {e.activeCommission.type === 'PERCENT_OF_SHIFT' &&
                      e.activeCommission.percent !== null
                        ? `${formatNumber(e.activeCommission.percent * 100, { decimals: 2 })}% turno`
                        : e.activeCommission.fixedAmount !== null
                          ? `${formatCop(e.activeCommission.fixedAmount)} / venta`
                          : '—'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">sin config</span>
                  )}
                </Td>
                <Td mono align="right">
                  {e.estimatedCommission > 0 ? (
                    <span className="font-medium text-emerald-700">
                      {formatCop(e.estimatedCommission)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-600">
          Comisión calculada solo para CAJERO con configuración vigente y
          shifts cerrados en el período.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">
        {value}
      </p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
function Td({ children, align, mono }: { children: React.ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
