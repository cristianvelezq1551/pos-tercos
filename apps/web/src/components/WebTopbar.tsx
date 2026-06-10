'use client';

import { BrandLogo } from '@pos-tercos/brand';
import { cn } from '@pos-tercos/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CartButton, CartDrawer, useCartUI } from '../features/cart';

const NAV_LINKS = [
  { label: 'Menú', href: '/' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Ubicaciones', href: '/ubicaciones' },
] as const;

export function WebTopbar({ transparent = false }: { transparent?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = useCartUI((s) => s.isOpen);
  const open = useCartUI((s) => s.open);
  const close = useCartUI((s) => s.close);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center justify-between px-6 backdrop-blur-md sm:px-12 lg:px-20',
        transparent
          ? 'bg-black/30'
          : 'bg-background/85 border-b border-border',
      )}
    >
      <Link href="/" aria-label="Inicio Terco's" className="flex items-center">
        {/* Sobre el hero transparente (oscuro) va el cursivo blanco; sobre el
            topbar claro va el cursivo oscuro. */}
        <BrandLogo variant="wordmark" theme={transparent ? 'dark' : 'light'} size="h-7" />
      </Link>

      <nav className="hidden items-center gap-8 md:flex">
        {NAV_LINKS.map((link) => {
          const active = link.href === pathname;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-sm font-medium transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden md:block">
        <CartButton onClick={open} />
      </div>

      <CartDrawer
        open={isOpen}
        onClose={close}
        onCheckout={() => {
          close();
          router.push('/checkout');
        }}
      />
    </header>
  );
}
