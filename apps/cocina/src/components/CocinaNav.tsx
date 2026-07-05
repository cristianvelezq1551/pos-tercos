'use client';

import { BookOpen, ClipboardCheck, CookingPot, Package, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/biblia', label: 'Biblia', icon: BookOpen },
  { href: '/produccion', label: 'Producción', icon: CookingPot },
  { href: '/inventario', label: 'Inventario', icon: Package },
  { href: '/incidencias', label: 'Incidencias', icon: TriangleAlert },
  { href: '/checklist', label: 'Checklist', icon: ClipboardCheck },
] as const;

/** Navegación principal de la cocina. En pantallas chicas solo íconos. */
export function CocinaNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de cocina" className="flex h-full items-stretch gap-0.5">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="hidden md:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export const COCINA_SECTIONS = TABS;
