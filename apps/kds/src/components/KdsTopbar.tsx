import type { User } from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import { LogoutButton } from '../features/auth';

export function KdsTopbar({ user }: { user: User | null }) {
  return (
    <Topbar variant="light">
      <Topbar.Brand>
        <BrandLogo variant="full" theme="dark" size="h-7" />
        <span className="caps ml-2 rounded-md bg-primary px-2 py-1 text-[0.625rem] text-primary-foreground">
          Cocina
        </span>
      </Topbar.Brand>

      <Topbar.Actions>
        {user ? (
          <UserMenu
            variant="dark"
            user={{ email: user.email, name: user.fullName, role: roleLabel(user.role) }}
            trailing={<LogoutButton />}
          />
        ) : (
          <LogoutButton />
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
