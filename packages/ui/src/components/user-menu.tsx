import * as React from 'react';
import { cn } from '../lib/utils';

export interface UserMenuUser {
  email: string;
  /** Nombre completo o display name (opcional). */
  name?: string;
  /** Rol legible (ej "Cajero", "Admin operativo"). */
  role?: string;
}

export interface UserMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  user: UserMenuUser;
  /** Slot a la derecha — típicamente el LogoutButton. */
  trailing?: React.ReactNode;
  /** En topbars dark, setear `dark`. Default infiere `light`. */
  variant?: 'light' | 'dark';
  /** Mostrar avatar con iniciales. Default true. */
  showAvatar?: boolean;
  /**
   * Barra apretada: el nombre y el rol solo aparecen desde 2xl.
   *
   * En la caja a 1366 px ese bloque se lleva ~190 px y dejaba a la navegación
   * sin sitio: "Gestión" salía cortado en "Gesti" y aparecía una barra de
   * desplazamiento en medio del encabezado. El avatar con las iniciales (y su
   * `title`) alcanza para saber quién está trabajando.
   */
  compact?: boolean;
}

/**
 * Bloque user info canónico para topbars: avatar (initials) + email + role.
 * Reemplaza el patrón inline duplicado en AdminTopbar/PosTopbar/KdsTopbar/WebTopbar.
 */
export function UserMenu({
  user,
  trailing,
  variant = 'light',
  showAvatar = true,
  compact = false,
  className,
  ...rest
}: UserMenuProps) {
  const initials = getInitials(user.name ?? user.email);
  const quien = [user.name ?? user.email, user.role].filter(Boolean).join(' · ');
  return (
    <div className={cn('flex items-center gap-2.5', className)} title={quien} {...rest}>
      {showAvatar ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            variant === 'dark'
              ? 'bg-ink-800 text-ink-50 ring-1 ring-ink-700'
              : 'bg-red-50 text-primary ring-1 ring-red-200',
          )}
        >
          {initials}
        </span>
      ) : null}

      <div className={cn('hidden min-w-0 flex-col text-left leading-tight', compact ? '2xl:flex' : 'md:flex')}>
        <span
          className={cn(
            'truncate text-xs font-semibold',
            variant === 'dark' ? 'text-ink-50' : 'text-foreground',
          )}
        >
          {user.name ?? user.email}
        </span>
        {user.role ? (
          <span
            className={cn(
              'caps text-[0.625rem]',
              variant === 'dark' ? 'text-ink-400' : 'text-muted-foreground',
            )}
          >
            {user.role}
          </span>
        ) : null}
      </div>

      {trailing}
    </div>
  );
}
UserMenu.displayName = 'UserMenu';

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s.@]+/)
    .filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
