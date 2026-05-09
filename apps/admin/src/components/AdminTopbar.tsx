import type { User } from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { LogoutButton } from '../features/auth/components/LogoutButton';

interface AdminTopbarProps {
  user: User | null;
}

export function AdminTopbar({ user }: AdminTopbarProps) {
  return (
    <Topbar variant="light">
      <Topbar.Brand>{/* la barra lateral ya muestra la marca */}</Topbar.Brand>
      <Topbar.Actions>
        {user ? (
          <UserMenu
            variant="dark"
            user={{ email: user.email, name: user.fullName, role: roleLabel(user.role) }}
            trailing={<LogoutButton />}
          />
        ) : (
          <span className="text-sm text-muted-foreground">Sin sesión</span>
        )}
      </Topbar.Actions>
    </Topbar>
  );
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    DUENO: 'Dueño',
    ADMIN_OPERATIVO: 'Administrador operativo',
    ADMIN_FINANCIERO: 'Administrador financiero',
    CAJERO: 'Cajero',
    COCINERO: 'Cocinero',
    REPARTIDOR: 'Repartidor',
  };
  return map[role] ?? role;
}
