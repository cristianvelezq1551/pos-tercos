'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const PRESETS: { label: string; days: number }[] = [
  { label: 'Esta semana', days: 7 },
  { label: 'Este mes', days: 30 },
  { label: '90 días', days: 90 },
];

/**
 * Filtro de fechas del listado de facturas. Vive en la URL para que el SSR
 * refetche y el filtro sobreviva a recargar o compartir el enlace.
 *
 * Sin fechas NO filtra nada: el listado sigue mostrando todo, como siempre.
 * Meterle un default de N días cambiaría en silencio lo que se ve al entrar.
 */
export function InvoiceDateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');

  // El estado local se resincroniza cuando la URL cambia por fuera (presets,
  // "Quitar", back del navegador); sin esto los inputs muestran lo viejo.
  useEffect(() => {
    setFrom(searchParams.get('from') ?? '');
    setTo(searchParams.get('to') ?? '');
  }, [searchParams]);

  const apply = (next: { from?: string; to?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    router.push(`?${params.toString()}`);
  };

  const preset = (days: number) => {
    const hoy = new Date();
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - (days - 1));
    apply({ from: ymd(desde), to: ymd(hoy) });
  };

  const hayFiltro = Boolean(searchParams.get('from') ?? searchParams.get('to'));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => preset(p.days)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-from" className="text-xs">Desde</Label>
        <Input
          id="inv-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => apply({ from })}
          className="h-9 w-[9.5rem]"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="inv-to" className="text-xs">Hasta</Label>
        <Input
          id="inv-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => apply({ to })}
          className="h-9 w-[9.5rem]"
        />
      </div>
      {hayFiltro && (
        <Button variant="ghost" size="sm" onClick={() => apply({ from: '', to: '' })}>
          Quitar fechas
        </Button>
      )}
    </div>
  );
}

/** YYYY-MM-DD del día LOCAL — nunca `toISOString()`, que en Bogotá adelanta el día. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
