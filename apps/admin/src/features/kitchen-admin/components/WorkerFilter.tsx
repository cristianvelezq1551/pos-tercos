'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export interface WorkerOption {
  userId: string;
  userName: string | null;
}

/** Filtro por trabajador. Las opciones son quienes REALMENTE hicieron algo en
 *  el rango: ofrecer una lista de empleados que no tocaron la cocina hace que
 *  filtrar devuelva vacío una y otra vez. */
export function WorkerFilter({ options }: { options: WorkerOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('user_id') ?? '';

  const apply = (userId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (userId) next.set('user_id', userId);
    else next.delete('user_id');
    router.push(`?${next.toString()}`);
  };

  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Trabajador
      <select
        value={current}
        onChange={(e) => apply(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.userName ?? 'Sin nombre'}
          </option>
        ))}
      </select>
    </label>
  );
}
