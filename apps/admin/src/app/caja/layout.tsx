import type { Metadata } from 'next';
import { CajaServiceWorker } from '../../components/CajaServiceWorker';
import { CajaTopbar } from '../../components/CajaTopbar';
import { SessionKeeper } from '../../features/auth';
import { getWsTokenServer, requireOperativoServer } from '../../features/auth/server';
import { OfflineProvider, OfflineStatusBar } from '../../features/offline';
import { ComandaFailureAlert } from '../../features/sales';
import { CortesiaNotifier, CortesiaWatchProvider } from '../../features/caja-cortesias';
import { getCurrentShiftServer } from '../../features/caja-shifts/server';
import { getPendingWebOrdersServer } from '../../features/web-orders/server';
import { saleToPublicWebOrder } from '../../features/web-orders/lib/project';

/**
 * Modo CAJA (unificación POS+admin). Pantalla completa, FUERA del AdminShell
 * (sin sidebar de gestión). Gateado a ADMIN_OPERATIVO (el dueño no opera caja).
 * Toda la infra offline/socket/cortesías se monta ACÁ — nunca en el layout de
 * gestión. Adaptado del layout autenticado del POS. Ver UNIFICACION-POS-ADMIN.md.
 */
/** Manifest + PWA metadata SOLO bajo /caja (la caja es la app instalable; la
 *  gestión no). Next mergea esta metadata en las rutas del segmento. */
export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Caja Tercos' },
  icons: { apple: '/icon-512.png' },
};

export default async function CajaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOperativoServer();
  const [shift, webSales, wsToken] = await Promise.all([
    getCurrentShiftServer(),
    getPendingWebOrdersServer(),
    getWsTokenServer(),
  ]);
  const webOrdersInitial = webSales
    .map(saleToPublicWebOrder)
    .filter((o): o is NonNullable<typeof o> => o !== null);
  return (
    <OfflineProvider user={user} shift={shift}>
      <CortesiaWatchProvider>
        <div className="flex h-dvh flex-col bg-background text-foreground">
          <CajaServiceWorker />
          <SessionKeeper />
          <OfflineStatusBar />
          <CajaTopbar
            user={user}
            shift={shift}
            webOrdersInitial={webOrdersInitial}
            wsToken={wsToken}
          />
          <main className="flex-1 overflow-hidden">{children}</main>
          <ComandaFailureAlert />
          <CortesiaNotifier />
        </div>
      </CortesiaWatchProvider>
    </OfflineProvider>
  );
}
