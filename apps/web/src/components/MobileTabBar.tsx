'use client';

import { cn } from '@pos-tercos/ui';
import { Grid2x2, House, ShoppingBag, Utensils } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cartLineCount, useCartStore, useCartUI } from '../features/cart';
import { MoreSheet } from './MoreSheet';

type TabKey = 'home' | 'menu' | 'cart' | 'more';

export function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const cartIsOpen = useCartUI((s) => s.isOpen);
  const openCart = useCartUI((s) => s.open);
  const items = useCartStore((s) => s.items);
  const count = cartLineCount(items);

  const [moreOpen, setMoreOpen] = useState(false);
  const [pageTab, setPageTab] = useState<'home' | 'menu' | 'more'>(() => {
    if (pathname === '/nosotros' || pathname === '/ubicaciones') return 'more';
    return 'home';
  });

  useEffect(() => {
    if (pathname === '/nosotros' || pathname === '/ubicaciones') {
      setPageTab('more');
      return;
    }
    if (pathname !== '/') {
      setPageTab('home');
      return;
    }
    const menuEl = document.getElementById('menu');
    if (!menuEl) {
      setPageTab('home');
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setPageTab(entry.isIntersecting ? 'menu' : 'home');
      },
      { root: null, rootMargin: '-25% 0px -55% 0px', threshold: 0 },
    );
    observer.observe(menuEl);
    return () => observer.disconnect();
  }, [pathname]);

  const active: TabKey = cartIsOpen ? 'cart' : moreOpen ? 'more' : pageTab;
  // La barra se OCULTA (no se desmonta el árbol) cuando hay una hoja abierta:
  // si el return cambiara de forma, React remontaría MoreSheet y su estado
  // interno (el modal de Horarios recién abierto) se perdería en silencio.
  const barHidden = cartIsOpen || moreOpen;

  const goHome = () => {
    setPageTab('home');
    if (pathname === '/') {
      if (typeof window !== 'undefined' && window.location.hash) {
        history.replaceState(null, '', '/');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      router.push('/');
    }
  };

  const goMenu = () => {
    setPageTab('menu');
    if (pathname !== '/') {
      router.push('/#menu');
      return;
    }
    const el = document.getElementById('menu');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#menu');
    }
  };

  return (
    <>
      <nav
        aria-label="Navegación principal"
        hidden={barHidden}
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 md:hidden"
      >
        <div className="pointer-events-auto flex h-[62px] items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-2xl backdrop-blur-md">
          <TabButton
            label="Inicio"
            icon={<House className="h-[18px] w-[18px]" strokeWidth={2} />}
            active={active === 'home'}
            onClick={goHome}
          />
          <TabButton
            label="Menú"
            icon={<Utensils className="h-[18px] w-[18px]" strokeWidth={2} />}
            active={active === 'menu'}
            onClick={goMenu}
          />
          <TabButton
            label="Carrito"
            icon={<ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />}
            active={active === 'cart'}
            onClick={openCart}
            badge={count}
          />
          <TabButton
            label="Más"
            icon={<Grid2x2 className="h-[18px] w-[18px]" strokeWidth={2} />}
            active={active === 'more'}
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-full transition-all duration-200 ease-out active:scale-95',
        active
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <div className="relative">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-card">
            {badge}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.05em]',
          active ? 'text-primary-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </button>
  );
}
