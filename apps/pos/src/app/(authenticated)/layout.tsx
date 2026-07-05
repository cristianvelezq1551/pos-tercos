import { PosTopbar } from '../../components/PosTopbar';
import { SessionKeeper } from '../../features/auth';
import { getAccessTokenServer, getCurrentUserServer } from '../../features/auth/server';
import { OfflineProvider, OfflineStatusBar } from '../../features/offline';
import { CortesiaNotifier, CortesiaWatchProvider } from '../../features/cortesias';
import { getCurrentShiftServer } from '../../features/shifts/server';
import { getPendingWebOrdersServer } from '../../features/web-orders/server';
import { saleToPublicWebOrder } from '../../features/web-orders/lib/project';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, shift, webSales, wsToken] = await Promise.all([
    getCurrentUserServer(),
    getCurrentShiftServer(),
    getPendingWebOrdersServer(),
    getAccessTokenServer(),
  ]);
  const webOrdersInitial = webSales
    .map(saleToPublicWebOrder)
    .filter((o): o is NonNullable<typeof o> => o !== null);
  return (
    <OfflineProvider user={user} shift={shift}>
      <CortesiaWatchProvider>
        <div className="flex h-dvh flex-col bg-background text-foreground">
          <SessionKeeper />
          <OfflineStatusBar />
          <PosTopbar
            user={user}
            shift={shift}
            webOrdersInitial={webOrdersInitial}
            wsToken={wsToken}
          />
          <main className="flex-1 overflow-hidden">{children}</main>
          <CortesiaNotifier />
        </div>
      </CortesiaWatchProvider>
    </OfflineProvider>
  );
}
