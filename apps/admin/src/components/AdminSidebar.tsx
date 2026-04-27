'use client';

import { cn } from '@pos-tercos/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { section: 'Operación', label: 'Dashboard', href: '/' },
  { section: 'Catálogo', label: 'Productos', href: '/products' },
  { section: 'Catálogo', label: 'Subproductos', href: '/subproducts' },
  { section: 'Catálogo', label: 'Insumos', href: '/ingredients' },
];

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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {item.label}
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
