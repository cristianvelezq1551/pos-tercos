'use client';

import { cn } from '@pos-tercos/ui';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Box,
  CalendarRange,
  ClipboardList,
  Clock,
  Coins,
  FileText,
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
  { section: 'Operación', label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { section: 'Catálogo', label: 'Productos', href: '/products', icon: ShoppingBasket },
  { section: 'Catálogo', label: 'Subproductos', href: '/subproducts', icon: Layers },
  { section: 'Catálogo', label: 'Insumos', href: '/ingredients', icon: Package },
  { section: 'Catálogo', label: 'Promociones', href: '/promotions', icon: Tag },
  { section: 'Compras', label: 'Facturas', href: '/invoices', icon: Receipt },
  { section: 'Compras', label: 'Proveedores', href: '/suppliers', icon: Truck },
  { section: 'Compras', label: 'Sugerencias IA', href: '/purchase-suggestions', icon: Sparkles },
  { section: 'Inventario', label: 'Stock', href: '/inventory', icon: Box },
  { section: 'Inventario', label: 'Movimientos', href: '/inventory/movements', icon: PackageOpen },
  { section: 'Caja', label: 'Turnos', href: '/shifts', icon: Wallet },
  { section: 'RRHH', label: 'Asistencia', href: '/workers/attendance', icon: UserCheck },
  { section: 'RRHH', label: 'Comisiones', href: '/workers/commissions', icon: Coins },
  { section: 'RRHH', label: 'Payroll período', href: '/workers/payroll', icon: Clock },
  { section: 'Reportes', label: 'Ventas', href: '/reports/sales', icon: LineChart },
  { section: 'Reportes', label: 'Productos', href: '/reports/products', icon: BarChart3 },
  { section: 'Reportes', label: 'Operación', href: '/reports/operations', icon: Activity },
  { section: 'Reportes', label: 'Anomalías', href: '/reports/anomalies', icon: CalendarRange },
  { section: 'Reportes', label: 'Reconciliación', href: '/reports/reconciliation', icon: ArrowLeftRight },
  { section: 'Auditoría', label: 'Log', href: '/audit', icon: History },
];

const SECTION_ICON: Record<string, LucideIcon> = {
  Operación: ClipboardList,
  Catálogo: FileText,
};

export function AdminSidebar() {
  const pathname = usePathname();
  const sections = Array.from(new Set(NAV_ITEMS.map((i) => i.section)));

  return (
    <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block">
      <div className="flex h-14 items-center border-b border-gray-200 px-5">
        <span className="text-sm font-semibold tracking-tight text-gray-900">POS Tercos</span>
        <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Admin
        </span>
      </div>

      <nav className="flex flex-col gap-6 px-3 py-5">
        {sections.map((section) => (
          <div key={section} className="flex flex-col gap-1">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {section}
            </p>
            {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Imported but unused — kept for potential section header icons in future iteration.
void SECTION_ICON;
