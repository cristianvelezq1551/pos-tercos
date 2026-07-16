'use client';

import { Sidebar, sidebarLinkClass } from '@pos-tercos/ui';
import {
  Activity,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Box,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  HandCoins,
  History,
  LayoutDashboard,
  Gift,
  Layers,
  LineChart,
  Globe,
  MonitorPlay,
  Package,
  PackageOpen,
  Receipt,
  Recycle,
  Shapes,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  CookingPot,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { UserRole } from '@pos-tercos/types';
import { useNavProgress } from './nav-progress';
// Deep import A PROPÓSITO: el barrel de cortesías re-exporta server.ts
// (next/headers) y este componente es 'use client' → romper el barrel acá
// rompe el build de producción. Excepción documentada a la regla del barrel.
import { useCortesiaPendingCount } from '../features/cortesias/hooks/usePendingCount';

interface NavItem {
  label: string;
  href: string;
  section: string;
  icon: LucideIcon;
  /** Solo visible para el Dueño (anti-fraude / auditoría cruda). */
  onlyDueno?: boolean;
  /** Solo visible para el Admin Operativo (caja — el Dueño no opera caja). */
  onlyOperativo?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { section: 'Operación', label: 'Inicio', href: '/', icon: LayoutDashboard, onlyDueno: true },
  { section: 'Operación', label: 'Caja', href: '/caja', icon: Wallet, onlyOperativo: true },
  { section: 'Operación', label: 'Turnero', href: '/turnero', icon: MonitorPlay },
  { section: 'Operación', label: 'Web del cliente', href: '/publicidad', icon: Globe },
  { section: 'Operación', label: 'Solicitudes', href: '/solicitudes', icon: Gift },
  { section: 'Operación', label: 'Cocina', href: '/cocina', icon: CookingPot },
  { section: 'Catálogo', label: 'Productos', href: '/products', icon: ShoppingBasket, onlyDueno: true },
  { section: 'Catálogo', label: 'Categorías', href: '/categories', icon: Shapes, onlyDueno: true },
  { section: 'Catálogo', label: 'Subproductos', href: '/subproducts', icon: Layers, onlyDueno: true },
  { section: 'Catálogo', label: 'Insumos', href: '/ingredients', icon: Package, onlyDueno: true },
  { section: 'Catálogo', label: 'Promociones', href: '/promotions', icon: Tag, onlyDueno: true },
  { section: 'Compras', label: 'Facturas', href: '/invoices', icon: Receipt },
  { section: 'Compras', label: 'Proveedores', href: '/suppliers', icon: Truck },
  { section: 'Compras', label: 'Sugerencias inteligentes', href: '/purchase-suggestions', icon: Sparkles },
  { section: 'Inventario', label: 'Existencias', href: '/inventory', icon: Box },
  { section: 'Inventario', label: 'Deudas', href: '/inventory/negativos', icon: TrendingDown },
  { section: 'Inventario', label: 'Movimientos', href: '/inventory/movements', icon: PackageOpen },
  { section: 'Inventario', label: 'Conteo físico', href: '/inventory/counts', icon: ClipboardCheck },
  { section: 'Caja', label: 'Turnos', href: '/shifts', icon: Wallet, onlyDueno: true },
  { section: 'Caja', label: 'Medios de pago', href: '/medios-pago', icon: CreditCard },
  { section: 'Personal', label: 'Usuarios', href: '/users', icon: Users, onlyDueno: true },
  { section: 'Personal', label: 'Nómina', href: '/workers/semana', icon: CalendarDays, onlyDueno: true },
  {
    section: 'Finanzas',
    label: 'Tesorería',
    href: '/finanzas/tesoreria',
    icon: Wallet,
    onlyDueno: true,
  },
  {
    section: 'Finanzas',
    label: 'Compromisos por pagar',
    href: '/finanzas/compromisos',
    icon: HandCoins,
    onlyDueno: true,
  },
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
    label: 'Costos y gastos',
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
  const pendingCortesias = useCortesiaPendingCount();
  const items = NAV_ITEMS.filter(
    (i) =>
      (!i.onlyDueno || role === 'DUENO') &&
      (!i.onlyOperativo || role === 'ADMIN_OPERATIVO'),
  );
  const sections = Array.from(new Set(items.map((i) => i.section)));
  // Solo UN item activo: el que mejor matchea (prefijo más largo). Evita que
  // "Existencias" (/inventory) se prenda cuando estás en "Movimientos"
  // (/inventory/movements).
  const activeHref = bestMatchHref(pathname, items);

  // Resaltado óptimista: las páginas hacen SSR bloqueante (fetch a la API) antes
  // de commitear la ruta, así que `usePathname()` tarda en cambiar. Sin esto el
  // ítem no se prende al instante y el clic "parece" no haber entrado. El estado
  // pendiente vive en el contexto (compartido con el esqueleto del contenido).
  const { pendingHref, startNav } = useNavProgress();
  const highlightHref = pendingHref ?? activeHref;

  // Trae el ítem activo a la vista: con muchas secciones queda fuera de pantalla
  // y el dueño pierde la referencia de en qué módulo está al navegar.
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeHref]);

  return (
    <Sidebar>
      {/* La marca vive en el topbar — la sidebar arranca directo con las secciones. */}
      <Sidebar.Sections>
        {sections.map((section) => (
          <Sidebar.Section key={section} title={section}>
            {items.filter((i) => i.section === section).map((item) => {
              const active = item.href === highlightHref;
              const pending = item.href === pendingHref;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    ref={active ? activeRef : undefined}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-busy={pending || undefined}
                    onClick={() => {
                      if (item.href !== activeHref) startNav(item.href);
                      onNavigate?.();
                    }}
                    className={sidebarLinkClass(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.href === '/solicitudes' && pendingCortesias > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.625rem] font-bold text-primary-foreground">
                        {pendingCortesias}
                      </span>
                    ) : null}
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
