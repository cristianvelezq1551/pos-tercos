'use client';

import { Archive, BellRing, History, Settings, UtensilsCrossed, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Vender', icon: UtensilsCrossed },
  { href: '/turnos', label: 'Turnos', icon: BellRing },
  { href: '/historial', label: 'Historial', icon: History },
  { href: '/caja', label: 'Caja', icon: Wallet },
  { href: '/arqueos', label: 'Arqueos', icon: Archive },
  { href: '/configuracion', label: 'Config', icon: Settings },
] as const;

/**
 * Navegación principal del cajero (estilo FUDO): pestañas con ícono en la
 * barra superior. En pantallas chicas solo se ven los íconos.
 */
export function PosNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del POS" className="flex h-full items-stretch gap-0.5">
      {TABS.map((tab) => {
        const active =
          tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
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
