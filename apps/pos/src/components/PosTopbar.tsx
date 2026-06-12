import type { PublicWebOrder, Shift, User } from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import Link from 'next/link';
import { LogoutButton } from '../features/auth';
import { ShiftCashBadge } from '../features/shifts';
import { WebOrdersAction } from '../features/web-orders';
import { PosNav } from './PosNav';

/**
 * Barra superior del POS (estilo FUDO): marca + pestañas con ícono
 * (Vender / Turnos / Historial / Caja) + pedidos web en vivo + usuario.
 * Anular vive en Historial; el estado/cierre de caja, en la pestaña Caja.
 */
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
      </Topbar.Brand>

      <div className="flex min-w-0 flex-1 items-stretch justify-center self-stretch py-1.5">
        <PosNav />
      </div>

      <Topbar.Actions className="shrink-0 [&>*]:shrink-0">
        <WebOrdersAction initial={webOrdersInitial} wsToken={wsToken} />
        {/* El efectivo esperado linkea a la pestaña Caja. */}
        <Link href="/caja" className="hidden lg:flex" aria-label="Ir a Caja">
          <ShiftCashBadge shift={shift} />
        </Link>
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
