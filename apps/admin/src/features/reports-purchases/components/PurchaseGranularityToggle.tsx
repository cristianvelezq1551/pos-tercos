'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/** Agrupar por semana o por mes. Vive en la URL, igual que el rango. */
export function PurchaseGranularityToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const actual = searchParams.get('granularity') ?? 'weekly';

  const set = (g: 'weekly' | 'monthly') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('granularity', g);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {(
        [
          ['weekly', 'Por semana'],
          ['monthly', 'Por mes'],
        ] as const
      ).map(([valor, label]) => (
        <button
          key={valor}
          type="button"
          onClick={() => set(valor)}
          className={`rounded px-3 py-1.5 text-sm transition ${
            actual === valor
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
