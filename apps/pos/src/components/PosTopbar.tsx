import type { Shift, User } from '@pos-tercos/types';
import { LogoutButton } from '../features/auth';
import { VoidSaleAction } from '../features/sales/components/VoidSaleAction';
import { APP_LABEL } from '../lib/auth-config';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function PosTopbar({ user, shift }: { user: User | null; shift: Shift | null }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">POS</span>
        <span className="text-sm font-semibold tracking-tight">{APP_LABEL}</span>
        {shift ? (
          <span
            className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700"
            title={`Apertura ${COP.format(shift.openingCash)}`}
          >
            ● Turno abierto
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <VoidSaleAction shiftId={shift?.id ?? null} />
        {user ? (
          <span className="text-sm text-gray-600">
            {user.email} · <span className="font-medium text-gray-900">{user.role}</span>
          </span>
        ) : null}
        <LogoutButton />
      </div>
    </header>
  );
}
