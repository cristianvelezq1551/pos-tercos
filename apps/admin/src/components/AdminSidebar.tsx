'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { Sidebar, sidebarLinkClass } from '@pos-tercos/ui';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Box,
  CalendarRange,
  Clock,
  Coins,
  History,
  LayoutDashboard,
  Layers,
  LineChart,
  Package,
  PackageOpen,
  Receipt,
  ShoppingBasket,
  Sparkles,
  Tag,
  Truck,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  section: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { section: 'Operación', label: 'Inicio', href: '/', icon: LayoutDashboard },
  { section: 'Catálogo', label: 'Productos', href: '/products', icon: ShoppingBasket },
  { section: 'Catálogo', label: 'Subproductos', href: '/subproducts', icon: Layers },
  { section: 'Catálogo', label: 'Insumos', href: '/ingredients', icon: Package },
  { section: 'Catálogo', label: 'Promociones', href: '/promotions', icon: Tag },
  { section: 'Compras', label: 'Facturas', href: '/invoices', icon: Receipt },
  { section: 'Compras', label: 'Proveedores', href: '/suppliers', icon: Truck },
  { section: 'Compras', label: 'Sugerencias inteligentes', href: '/purchase-suggestions', icon: Sparkles },
  { section: 'Inventario', label: 'Existencias', href: '/inventory', icon: Box },
  { section: 'Inventario', label: 'Movimientos', href: '/inventory/movements', icon: PackageOpen },
  { section: 'Caja', label: 'Turnos', href: '/shifts', icon: Wallet },
  { section: 'Personal', label: 'Asistencia', href: '/workers/attendance', icon: UserCheck },
  { section: 'Personal', label: 'Comisiones', href: '/workers/commissions', icon: Coins },
  { section: 'Personal', label: 'Nómina del período', href: '/workers/payroll', icon: Clock },
  { section: 'Reportes', label: 'Ventas', href: '/reports/sales', icon: LineChart },
  { section: 'Reportes', label: 'Productos', href: '/reports/products', icon: BarChart3 },
  { section: 'Reportes', label: 'Operación', href: '/reports/operations', icon: Activity },
  { section: 'Reportes', label: 'Anomalías', href: '/reports/anomalies', icon: CalendarRange },
  {
    section: 'Reportes',
    label: 'Reconciliación',
    href: '/reports/reconciliation',
    icon: ArrowLeftRight,
  },
  { section: 'Auditoría', label: 'Bitácora', href: '/audit', icon: History },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const sections = Array.from(new Set(NAV_ITEMS.map((i) => i.section)));

  return (
    <Sidebar>
      <Sidebar.Header>
        <BrandLogo variant="full" theme="dark" size="h-8" />
      </Sidebar.Header>

      <Sidebar.Sections>
        {sections.map((section) => (
          <Sidebar.Section key={section} title={section}>
            {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
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

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
