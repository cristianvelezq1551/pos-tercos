import { LogoutButton } from '../features/auth/components/LogoutButton';
import type { User } from '@pos-tercos/types';

interface AdminTopbarProps {
  user: User | null;
}

export function AdminTopbar({ user }: AdminTopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="text-sm font-medium text-gray-700">{/* breadcrumb slot */}</div>
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
              {initialsFor(user.fullName)}
            </div>
            <div className="hidden flex-col leading-tight md:flex">
              <span className="font-medium text-gray-900">{user.fullName}</span>
              <span className="text-xs text-gray-500">{user.role}</span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-gray-500">Sin sesión</span>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
