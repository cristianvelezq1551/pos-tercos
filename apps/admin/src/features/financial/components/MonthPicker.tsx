'use client';

import { Button } from '@pos-tercos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

interface Props {
  year: number;
  month: number; // 1-12
}

/** Selector de mes que actualiza la URL (?year=&month=) para que la página SSR refetchee. */
export function MonthPicker({ year, month }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const go = (delta: number): void => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    const sp = new URLSearchParams(search.toString());
    sp.set('year', String(d.getUTCFullYear()));
    sp.set('month', String(d.getUTCMonth() + 1));
    router.push(`?${sp.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <Button variant="ghost" size="sm" onClick={() => go(-1)} aria-label="Mes anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-44 text-center font-display text-base font-bold capitalize text-foreground">
        {MONTHS_ES[month - 1]} {year}
      </span>
      <Button variant="ghost" size="sm" onClick={() => go(1)} aria-label="Mes siguiente">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
