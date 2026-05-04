'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@pos-tercos/ui';

const PRESETS: { label: string; days: number }[] = [
  { label: 'Hoy', days: 1 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

/**
 * Filtro from/to + granularity en URL search params. Cambia query →
 * router.push y deja que el SSR del page haga refetch.
 */
export function RangeFilter({
  showGranularity = false,
}: {
  showGranularity?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');
  const granularity = searchParams.get('granularity') ?? 'daily';

  useEffect(() => {
    setFrom(searchParams.get('from') ?? '');
    setTo(searchParams.get('to') ?? '');
  }, [searchParams]);

  const apply = (params: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  };

  const handlePreset = (days: number) => {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (days - 1));
    apply({
      from: toISO(fromDate),
      to: toISO(today),
    });
  };

  const handleApply = () => {
    apply({ from: from || undefined, to: to || undefined });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p.days)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="text-xs">
          <span className="block text-gray-600">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-gray-600">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
          />
        </label>
        <Button size="sm" onClick={handleApply}>
          Aplicar
        </Button>
      </div>
      {showGranularity && (
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-gray-600">Granularidad:</span>
          <button
            type="button"
            onClick={() => apply({ granularity: 'daily' })}
            className={`rounded-md border px-2.5 py-1 ${
              granularity === 'daily'
                ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Por día
          </button>
          <button
            type="button"
            onClick={() => apply({ granularity: 'hourly' })}
            className={`rounded-md border px-2.5 py-1 ${
              granularity === 'hourly'
                ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Por hora
          </button>
        </div>
      )}
    </div>
  );
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
