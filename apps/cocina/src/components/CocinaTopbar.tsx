import { BrandLogo } from '@pos-tercos/brand';
import { USER_ROLE_LABELS, type User, type UserRole } from '@pos-tercos/types';
import Link from 'next/link';
import { LogoutButton } from '../features/auth';
import { CocinaNav } from './CocinaNav';

function roleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

/** Barra superior de la cocina: marca + pestañas + usuario. */
export function CocinaTopbar({ user }: { user: User | null }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
      <div className="flex h-full items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center">
          <BrandLogo variant="mark" theme="dark" size="h-8" />
        </Link>
        <div className="hidden h-full sm:block">
          <CocinaNav />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
            <p className="text-[0.6875rem] text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  );
}
