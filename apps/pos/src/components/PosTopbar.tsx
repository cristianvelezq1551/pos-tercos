import type { PublicWebOrder, Shift, User } from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import { ChangePinAction, LogoutButton } from '../features/auth';
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
      <Topbar.Brand>
        <BrandLogo variant="full" theme="dark" size="h-7" />
        <ShiftCashBadge shift={shift} />
      </Topbar.Brand>

      <Topbar.Actions>
        <TurnAction />
        <WebOrdersAction initial={webOrdersInitial} wsToken={wsToken} />
        <DayHistoryAction />
        <CajaAction shift={shift} />
        <VoidSaleAction shiftId={shift?.id ?? null} />
        <CloseShiftAction shift={shift} />
        <ChangePinAction user={user} />
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
