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
export function RangeFilter({ showGranularity = false }: { showGranularity?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');
  const granularity = searchParams.get('granularity') ?? 'daily';

  useEffect(() => {
    setFrom(searchParams.get('from') ?? '');
    setTo(searchParams.get('to') ?? '');
  }, [searchParams]);

  const activePreset = matchPreset(searchParams.get('from'), searchParams.get('to'));

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
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p.days)}
            aria-pressed={activePreset === p.days}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activePreset === p.days
                ? 'border-primary bg-destructive/10 text-primary font-semibold'
                : 'border-border text-foreground hover:bg-muted/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
        <label className="min-w-0 flex-1 text-xs sm:flex-none">
          <span className="block text-muted-foreground">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 h-9 w-full rounded-md border border-input bg-card px-2 text-base sm:w-auto sm:text-sm"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs sm:flex-none">
          <span className="block text-muted-foreground">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 h-9 w-full rounded-md border border-input bg-card px-2 text-base sm:w-auto sm:text-sm"
          />
        </label>
        <Button size="sm" onClick={handleApply}>
          Aplicar
        </Button>
      </div>
      {showGranularity && (
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Granularidad:</span>
          <button
            type="button"
            onClick={() => apply({ granularity: 'daily' })}
            className={`rounded-md border px-2.5 py-1 ${
              granularity === 'daily'
                ? 'border-primary bg-destructive/10 text-primary font-semibold'
                : 'border-border text-foreground hover:bg-muted/40'
            }`}
          >
            Por día
          </button>
          <button
            type="button"
            onClick={() => apply({ granularity: 'hourly' })}
            className={`rounded-md border px-2.5 py-1 ${
              granularity === 'hourly'
                ? 'border-primary bg-destructive/10 text-primary font-semibold'
                : 'border-border text-foreground hover:bg-muted/40'
            }`}
          >
            Por hora
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Devuelve los `days` del preset que corresponde al rango from/to actual, o
 * null si es un rango manual. Un preset activo tiene `to` = hoy y
 * `from` = hoy − (days − 1).
 */
function matchPreset(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const today = new Date();
  if (to !== toISO(today)) return null;
  for (const p of PRESETS) {
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (p.days - 1));
    if (from === toISO(fromDate)) return p.days;
  }
  return null;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
