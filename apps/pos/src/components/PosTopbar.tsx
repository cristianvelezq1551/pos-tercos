import type { PublicWebOrder, Shift, User } from '@pos-tercos/types';
import { Badge, Topbar, UserMenu, formatCop } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import { ChangePinAction, LogoutButton } from '../features/auth';
import { VoidSaleAction } from '../features/sales/components/VoidSaleAction';
import { CloseShiftAction } from '../features/shifts/components/CloseShiftAction';
import { TurnAction } from '../features/turn';
import { WebOrdersAction } from '../features/web-orders/components/WebOrdersAction';

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
        {shift ? (
          <Badge tone="success" size="md" withDot className="ml-2">
            Turno abierto · {formatCop(shift.openingCash)}
          </Badge>
        ) : (
          <span className="caps ml-2 text-[0.625rem] text-muted-foreground">
            Sin turno
          </span>
        )}
      </Topbar.Brand>

      <Topbar.Actions>
        <TurnAction />
        <WebOrdersAction initial={webOrdersInitial} wsToken={wsToken} />
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
    REPARTIDOR: 'Repartidor',
  };
  return map[role] ?? role;
}
