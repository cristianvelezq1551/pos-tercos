'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KITCHEN_TABS, type KitchenTab } from '../tabs';

/** Navegación del hub. Conserva el rango y el trabajador al cambiar de pestaña:
 *  perder el filtro en cada clic obliga a re-elegirlo todo el tiempo. */
export function KitchenTabs({ active }: { active: KitchenTab }) {
  const searchParams = useSearchParams();

  const hrefFor = (tab: KitchenTab): string => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', tab);
    return `?${next.toString()}`;
  };

  return (
    <nav aria-label="Secciones de cocina" className="flex flex-wrap gap-1.5">
      {KITCHEN_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={hrefFor(tab.key)}
          aria-current={tab.key === active ? 'page' : undefined}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            tab.key === active
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted/40'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
