'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { RouteSkeleton } from './RouteSkeleton';

interface NavProgress {
  /** Href destino mientras la navegación está en curso; null cuando ya commiteó. */
  pendingHref: string | null;
  startNav: (href: string) => void;
}

const NavProgressContext = createContext<NavProgress>({
  pendingHref: null,
  startNav: () => {},
});

/**
 * Estado de navegación compartido entre el sidebar (resaltado óptimista) y el
 * área de contenido (esqueleto). Apenas se toca un ítem marcamos el destino; la
 * ruta nueva, al commitear, cambia `usePathname` y limpiamos el pendiente.
 */
export function NavProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // La ruta cambió → la navegación terminó (haya tardado lo que haya tardado).
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <NavProgressContext.Provider value={{ pendingHref, startNav: setPendingHref }}>
      {children}
    </NavProgressContext.Provider>
  );
}

export function useNavProgress() {
  return useContext(NavProgressContext);
}

/**
 * Muestra el esqueleto apenas se inicia una navegación a otro módulo, en vez de
 * dejar congelada la página anterior. El RSC de la página nueva se sigue
 * descargando en paralelo; cuando llega, `pathname` cambia y mostramos el
 * contenido real.
 */
export function MainSkeletonGate({ children }: { children: React.ReactNode }) {
  const { pendingHref } = useNavProgress();
  const pathname = usePathname();
  const navigating = pendingHref !== null && pendingHref !== pathname;
  return navigating ? <RouteSkeleton /> : <>{children}</>;
}
