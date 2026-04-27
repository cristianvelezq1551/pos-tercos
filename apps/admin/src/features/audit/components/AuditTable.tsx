'use client';

import { useState } from 'react';
import type { AuditLogEntry } from '@pos-tercos/types';

interface AuditTableProps {
  rows: AuditLogEntry[];
}

export function AuditTable({ rows }: AuditTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">No hay entradas de auditoría todavía.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Fecha</Th>
            <Th>Acción</Th>
            <Th>Usuario</Th>
            <Th>Entidad</Th>
            <Th>Detalle</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    entry.beforeJson !== null || entry.afterJson !== null || entry.metadata !== null;

  return (
    <>
      <tr className="hover:bg-gray-50">
        <Td>
          <time className="font-mono text-xs text-gray-600" dateTime={entry.createdAt}>
            {formatDate(entry.createdAt)}
          </time>
        </Td>
        <Td>
          <ActionBadge action={entry.action} />
        </Td>
        <Td>
          {entry.userEmail ? (
            <div className="flex flex-col leading-tight">
              <span className="font-medium text-gray-900">
                {entry.userFullName ?? entry.userEmail}
              </span>
              <span className="text-xs text-gray-500">{entry.userEmail}</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">(sin user)</span>
          )}
        </Td>
        <Td>
          {entry.entityType ? (
            <div className="flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-wider text-gray-500">
                {entry.entityType}
              </span>
              {entry.entityId && (
                <span className="font-mono text-xs text-gray-600">
                  {entry.entityId.slice(0, 8)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </Td>
        <Td>
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {open ? 'Ocultar' : 'Ver detalle'}
            </button>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </Td>
      </tr>
      {open && hasDetails && (
        <tr>
          <td colSpan={5} className="bg-gray-50 px-4 py-3">
            <DetailBlock label="Metadata" value={entry.metadata} />
            <DetailBlock label="Antes" value={entry.beforeJson} />
            <DetailBlock label="Después" value={entry.afterJson} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-md border border-gray-200 bg-white p-2 font-mono text-xs text-gray-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const tone = toneFor(action);
  const map = {
    auth: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    failed: 'bg-red-50 text-red-700 ring-red-600/20',
    inventory: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    catalog: 'bg-purple-50 text-purple-700 ring-purple-600/20',
    sale: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    other: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {action}
    </span>
  );
}

function toneFor(action: string): 'auth' | 'failed' | 'inventory' | 'catalog' | 'sale' | 'other' {
  if (action.endsWith('_FAILED') || action.endsWith('_DENIED')) return 'failed';
  if (action.startsWith('AUTH_')) return 'auth';
  if (action.startsWith('INVENTORY_')) return 'inventory';
  if (
    action.startsWith('PRODUCT_') ||
    action.startsWith('SUBPRODUCT_') ||
    action.startsWith('INGREDIENT_') ||
    action.startsWith('RECIPE_')
  ) {
    return 'catalog';
  }
  if (action.startsWith('SALE_') || action.startsWith('SHIFT_') || action.startsWith('CASH_'))
    return 'sale';
  return 'other';
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-gray-700">{children}</td>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
