import {
  USER_ROLE_LABELS,
  type PublicWebOrder,
  type Shift,
  type User,
  type UserRole,
} from '@pos-tercos/types';
import { Topbar, UserMenu } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import Link from 'next/link';
import { LogoutButton } from '../features/auth';
import { ShiftCashBadge } from '../features/caja-shifts';
import { WebOrdersAction } from '../features/web-orders';
import { CajaNav } from './CajaNav';

/**
 * Barra superior del modo Caja (adaptada de PosTopbar del POS): marca +
 * pestañas (Vender/Historial/Caja/Arqueos/Config + Panel) + pedidos web en
 * vivo + badge de efectivo + usuario. Unificación POS+admin, Fase 2e.
 */
export function CajaTopbar({
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
      {/* En celular el logotipo se esconde: la herramienta son las pestañas y
          la marca es decoración. */}
      <Topbar.Brand className="hidden shrink-0 sm:flex">
        <BrandLogo variant="wordmark" theme="dark" size="h-6" />
      </Topbar.Brand>

      {/* Las pestañas SOLO se centran cuando sobra espacio.
          Centradas siempre, un contenido más ancho que su caja se desborda
          hacia los DOS lados: medido, entre 768 y 1280 px —el rango de una
          tableta, que es el dispositivo de la caja— arrancaban en x=-107, o
          sea fuera de la pantalla y encima del logotipo, dejando "Historial"
          cortado en "storial". Alineadas a la izquierda cada una ocupa su
          caja, y si no caben se desplazan en vez de salirse. El centrado vuelve
          en 2xl (1536 px) y no antes: a 1280 todavía mordía el logo por 7 px. */}
      <div className="flex min-w-0 flex-1 items-stretch justify-start self-stretch overflow-x-auto py-1.5 2xl:justify-center">
        <CajaNav />
      </div>

      <Topbar.Actions className="shrink-0 [&>*]:shrink-0">
        <WebOrdersAction initial={webOrdersInitial} wsToken={wsToken} />
        <Link href="/caja/cierre" className="hidden lg:flex" aria-label="Ir a Caja">
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
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}
