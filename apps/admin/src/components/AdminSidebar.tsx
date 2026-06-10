'use client';

import { Sidebar, sidebarLinkClass } from '@pos-tercos/ui';
import {
  Activity,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Box,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coins,
  History,
  LayoutDashboard,
  Layers,
  LineChart,
  Package,
  PackageOpen,
  Receipt,
  Recycle,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@pos-tercos/types';

interface NavItem {
  label: string;
  href: string;
  section: string;
  icon: LucideIcon;
  /** Solo visible para el Dueño (anti-fraude / auditoría cruda). */
  onlyDueno?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { section: 'Operación', label: 'Inicio', href: '/', icon: LayoutDashboard, onlyDueno: true },
  { section: 'Catálogo', label: 'Productos', href: '/products', icon: ShoppingBasket },
  { section: 'Catálogo', label: 'Subproductos', href: '/subproducts', icon: Layers },
  { section: 'Catálogo', label: 'Insumos', href: '/ingredients', icon: Package },
  { section: 'Catálogo', label: 'Promociones', href: '/promotions', icon: Tag },
  { section: 'Compras', label: 'Facturas', href: '/invoices', icon: Receipt },
  { section: 'Compras', label: 'Proveedores', href: '/suppliers', icon: Truck },
  { section: 'Compras', label: 'Sugerencias inteligentes', href: '/purchase-suggestions', icon: Sparkles },
  { section: 'Inventario', label: 'Existencias', href: '/inventory', icon: Box },
  { section: 'Inventario', label: 'Movimientos', href: '/inventory/movements', icon: PackageOpen },
  { section: 'Inventario', label: 'Conteo físico', href: '/inventory/counts', icon: ClipboardCheck },
  { section: 'Caja', label: 'Turnos', href: '/shifts', icon: Wallet, onlyDueno: true },
  { section: 'Personal', label: 'Usuarios', href: '/users', icon: Users, onlyDueno: true },
  { section: 'Personal', label: 'Nómina', href: '/workers/payroll', icon: Clock, onlyDueno: true },
  {
    section: 'Finanzas',
    label: 'Pagos y cobros',
    href: '/finanzas/pagos',
    icon: Banknote,
    onlyDueno: true,
  },
  {
    section: 'Finanzas',
    label: 'Estado financiero',
    href: '/finanzas/estado',
    icon: TrendingUp,
    onlyDueno: true,
  },
  {
    section: 'Finanzas',
    label: 'Costos fijos',
    href: '/finanzas/costos-fijos',
    icon: Coins,
    onlyDueno: true,
  },
  { section: 'Reportes', label: 'Ventas', href: '/reports/sales', icon: LineChart, onlyDueno: true },
  { section: 'Reportes', label: 'Productos', href: '/reports/products', icon: BarChart3, onlyDueno: true },
  { section: 'Reportes', label: 'Operación', href: '/reports/operations', icon: Activity, onlyDueno: true },
  {
    section: 'Reportes',
    label: 'Costos y margen real',
    href: '/reports/costos',
    icon: Coins,
    onlyDueno: true,
  },
  {
    section: 'Reportes',
    label: 'Uso y mermas',
    href: '/reports/usage',
    icon: Recycle,
    onlyDueno: true,
  },
  {
    section: 'Reportes',
    label: 'Anomalías',
    href: '/reports/anomalies',
    icon: CalendarRange,
    onlyDueno: true,
  },
  {
    section: 'Reportes',
    label: 'Reconciliación',
    href: '/reports/reconciliation',
    icon: ArrowLeftRight,
    onlyDueno: true,
  },
  { section: 'Auditoría', label: 'Bitácora', href: '/bitacora', icon: ClipboardList, onlyDueno: true },
  {
    section: 'Auditoría',
    label: 'Auditoría completa',
    href: '/audit',
    icon: History,
    onlyDueno: true,
  },
];

export function AdminSidebar({
  role,
  onNavigate,
}: {
  role?: UserRole;
  /** Se invoca al tocar un link — útil para cerrar el drawer en móvil. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.onlyDueno || role === 'DUENO');
  const sections = Array.from(new Set(items.map((i) => i.section)));
  // Solo UN item activo: el que mejor matchea (prefijo más largo). Evita que
  // "Existencias" (/inventory) se prenda cuando estás en "Movimientos"
  // (/inventory/movements).
  const activeHref = bestMatchHref(pathname, items);

  return (
    <Sidebar>
      {/* La marca vive en el topbar — la sidebar arranca directo con las secciones. */}
      <Sidebar.Sections>
        {sections.map((section) => (
          <Sidebar.Section key={section} title={section}>
            {items.filter((i) => i.section === section).map((item) => {
              const active = item.href === activeHref;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={sidebarLinkClass(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </Sidebar.Section>
        ))}
      </Sidebar.Sections>
    </Sidebar>
  );
}

/** El href del ítem que mejor cubre el pathname (prefijo más largo). */
function bestMatchHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    const matches =
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && item.href.length > bestLen) {
      best = item.href;
      bestLen = item.href.length;
    }
  }
  return best;
}
