import type { PublicWebOrder, Shift, User } from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import { LogoutButton } from '../features/auth';
import { DayHistoryAction, VoidSaleAction } from '../features/sales';
import { CajaAction, CloseShiftAction, ShiftCashBadge } from '../features/shifts';
import { TurnAction } from '../features/turn';
import { WebOrdersAction } from '../features/web-orders';

export function PosTopbar({
  user,
  shift,
  webOrdersInitial,
  wsToken,
}: {
  user: User | null;
  shift: Shift | null;
  webOrdersInitial: PublicWebOrder[];
  wsToken: string | null;
}) {
  return (
    <Topbar variant="light">
      <Topbar.Brand className="shrink-0">
        <BrandLogo variant="wordmark" theme="dark" size="h-6" />
        {/* El badge de caja ocupa espacio: se oculta en pantallas chicas. */}
        <span className="hidden lg:flex">
          <ShiftCashBadge shift={shift} />
        </span>
      </Topbar.Brand>

      {/*
        Las acciones se desplazan horizontalmente si no caben (pantallas muy
        chicas) en vez de romper el layout. Turnos e Historial se ocultan del
        topbar cuando la barra lateral ya los muestra (lg+).
      */}
      <Topbar.Actions className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
        <WebOrdersAction initial={webOrdersInitial} wsToken={wsToken} />
        <span className="flex items-center lg:hidden">
          <TurnAction />
        </span>
        <span className="flex items-center lg:hidden">
          <DayHistoryAction />
        </span>
        <VoidSaleAction shiftId={shift?.id ?? null} />
        <CajaAction shift={shift} />
        <CloseShiftAction shift={shift} />
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
  };
  return map[role] ?? role;
}
