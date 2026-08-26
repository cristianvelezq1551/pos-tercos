import { CocinaTabBar } from '../../components/CocinaNav';
import { CocinaTopbar } from '../../components/CocinaTopbar';
import { SessionKeeper, getCurrentUserServer } from '../../features/auth';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <SessionKeeper />
      <CocinaTopbar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      {/* Solo en celular: en pantallas grandes las pestañas viven en el topbar. */}
      <CocinaTabBar />
    </div>
  );
}
