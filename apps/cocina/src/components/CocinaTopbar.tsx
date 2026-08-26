import { BrandLogo } from '@pos-tercos/brand';
import { USER_ROLE_LABELS, type User, type UserRole } from '@pos-tercos/types';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { LogoutButton } from '../features/auth';
import { CocinaNav } from './CocinaNav';

function roleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

/**
 * Barra superior: marca + pestañas (solo en pantallas grandes) + ayuda +
 * usuario. En celular las pestañas están abajo (`CocinaTabBar`), así que acá
 * arriba queda el atajo a la guía, que se consulta y no se navega a cada rato.
 */
export function CocinaTopbar({ user }: { user: User | null }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
      <div className="flex h-full items-center gap-3">
        <Link href="/" className="flex h-11 shrink-0 items-center" aria-label="Inicio">
          <BrandLogo variant="mark" theme="dark" size="h-8" />
        </Link>
        <div className="hidden h-full sm:block">
          <CocinaNav />
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        {user ? (
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
            <p className="text-[0.6875rem] text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
        ) : null}
        <Link
          href="/guia"
          aria-label="Abrir la guía"
          title="Guía"
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
        >
          <BookOpen className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
