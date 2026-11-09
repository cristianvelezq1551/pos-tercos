'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MonthStepper } from '../../../components/MonthStepper';

interface Props {
  year: number;
  month: number; // 1-12
}

/** Selector de mes que actualiza la URL (?year=&month=) para que la página SSR refetchee. */
export function MonthPicker({ year, month }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const go = (next: { year: number; month: number }): void => {
    const sp = new URLSearchParams(search.toString());
    sp.set('year', String(next.year));
    sp.set('month', String(next.month));
    router.push(`?${sp.toString()}`);
  };

  return <MonthStepper year={year} month={month} onChange={go} />;
}
