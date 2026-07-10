'use client';

import { Archive, History, LayoutGrid, Settings, UtensilsCrossed, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnseenCortesias } from '../features/caja-cortesias';

const TABS = [
  { href: '/caja', label: 'Vender', icon: UtensilsCrossed },
  { href: '/caja/historial', label: 'Historial', icon: History },
  { href: '/caja/cierre', label: 'Caja', icon: Wallet },
  { href: '/caja/arqueos', label: 'Arqueos', icon: Archive },
  { href: '/caja/configuracion', label: 'Config', icon: Settings },
] as const;

/**
 * Navegación del modo Caja (estilo FUDO): pestañas con ícono. Portado/adaptado
 * de PosNav del POS. El botón "Panel" devuelve al dashboard del admin.
 */
export function CajaNav() {
  const pathname = usePathname();
  const unseenCortesias = useUnseenCortesias();
  return (
    <nav aria-label="Secciones de la caja" className="flex h-full items-stretch gap-0.5">
      {TABS.map((tab) => {
        const active =
          tab.href === '/caja' ? pathname === '/caja' : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        const badge = tab.href === '/caja/historial' ? unseenCortesias : 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            <span className="hidden md:inline">{tab.label}</span>
            {badge > 0 ? (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-bold text-destructive-foreground">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      {/* Volver al launcher (elegir Caja/Gestión). */}
      <Link
        href="/inicio"
        className="ml-2 flex items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LayoutGrid className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span className="hidden md:inline">Inicio</span>
      </Link>
    </nav>
  );
}
