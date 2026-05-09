import type { User } from '@pos-tercos/types';
import { AppShell } from '@pos-tercos/ui';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

interface AdminShellProps {
  user: User | null;
  children: React.ReactNode;
}

/**
 * Shell admin: topbar + sidebar lg+ + main scrollable. El main NO trae
 * padding — cada page es responsable de envolver en `<Container>` para
 * obtener gutters consistentes (px-4 sm:px-6 lg:px-8).
 *
 * Si una page renderiza solo un PageHeader (full-width) + Container,
 * el resultado se ve uniformemente alineado en todas las rutas.
 */
export function AdminShell({ user, children }: AdminShellProps) {
  return (
    <AppShell
      topbar={<AdminTopbar user={user} />}
      sidebar={<AdminSidebar />}
      mainClassName="overflow-y-auto"
    >
      {children}
    </AppShell>
  );
}
