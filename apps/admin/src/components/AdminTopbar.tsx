import type { User } from '@pos-tercos/types';
import { BrandLogo } from '@pos-tercos/brand';
import { IconButton, Topbar, UserMenu } from '@pos-tercos/ui';
import { Menu } from 'lucide-react';
import { LogoutButton } from '../features/auth';

interface AdminTopbarProps {
  user: User | null;
  /** Abre el menú de navegación en móvil. */
  onMenuClick?: () => void;
}

export function AdminTopbar({ user, onMenuClick }: AdminTopbarProps) {
  return (
    <Topbar variant="light">
      <Topbar.Brand>
        {onMenuClick ? (
          <IconButton
            aria-label="Abrir menú"
            variant="ghost"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {/* Marca SIEMPRE visible en el topbar — no se duplica en la sidebar. */}
        <BrandLogo variant="wordmark" theme="dark" size="h-6" />
      </Topbar.Brand>
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
  };
  return map[role] ?? role;
}
