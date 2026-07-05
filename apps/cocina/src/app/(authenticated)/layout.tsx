import { CocinaNav } from '../../components/CocinaNav';
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
      {/* Nav móvil: debajo del topbar en pantallas chicas. */}
      <div className="border-b border-border bg-card px-2 py-1.5 sm:hidden">
        <CocinaNav />
      </div>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
