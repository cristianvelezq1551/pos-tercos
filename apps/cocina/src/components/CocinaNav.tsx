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

/**
 * Barra de secciones en escritorio (pestañas arriba). En celular NO se usa
 * esta: va `CocinaTabBar`, abajo y al alcance del pulgar.
 *
 * `h-full items-stretch` solo funciona si el contenedor tiene altura — el
 * topbar la tiene (h-14). Metido en un div sin altura, cada pestaña colapsaba
 * al alto del ícono (20 px) y era imposible de acertar con el dedo.
 */
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
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Barra inferior del celular — el dispositivo con el que se usa la cocina.
 *
 * Va ABAJO porque en una pantalla de 844 px el pulgar no llega arriba sin
 * recolocar la mano, y acá se navega con una mano mientras la otra está
 * ocupada. Cada destino mide 56 px de alto y muestra SU NOMBRE: antes eran
 * cinco íconos de 20 px sin etiqueta, o sea adivinar.
 */
export function CocinaTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones de cocina"
      className="grid shrink-0 grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors ${
              active ? 'text-primary' : 'text-muted-foreground active:bg-muted'
            }`}
          >
            <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            <span className="w-full truncate text-center text-[0.6875rem] font-medium leading-none">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export const COCINA_SECTIONS = TABS;
