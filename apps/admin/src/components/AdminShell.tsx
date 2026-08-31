'use client';

import type { User } from '@pos-tercos/types';
import { AppShell, Drawer } from '@pos-tercos/ui';
import { useState } from 'react';
import { GuiaAsistenteBurbuja } from '../features/guia';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { MainSkeletonGate, NavProgressProvider } from './nav-progress';

interface AdminShellProps {
  user: User | null;
  children: React.ReactNode;
}

/**
 * Shell admin: topbar + sidebar lg+ + main scrollable. En <lg la sidebar se
 * oculta y se abre como Drawer desde la hamburguesa del topbar (antes no había
 * forma de navegar en móvil/tablet).
 *
 * El main NO trae padding — cada page envuelve en `<Container>` para gutters
 * consistentes (px-4 sm:px-6 lg:px-8).
 */
export function AdminShell({ user, children }: AdminShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <NavProgressProvider>
      <AppShell
        topbar={<AdminTopbar user={user} onMenuClick={() => setNavOpen(true)} />}
        sidebar={<AdminSidebar role={user?.role} />}
        mainClassName="overflow-y-auto pb-24"
      >
        <MainSkeletonGate>{children}</MainSkeletonGate>
      </AppShell>

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        side="left"
        width="w-72"
        label="Navegación"
      >
        <AdminSidebar role={user?.role} onNavigate={() => setNavOpen(false)} />
      </Drawer>

      {/* La ayuda vive acá y no en cada página: la duda aparece mirando un
          reporte, no entrando a la guía. */}
      <GuiaAsistenteBurbuja />
    </NavProgressProvider>
  );
}
