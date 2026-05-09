import { KdsTopbar } from '../../components/KdsTopbar';
import { getCurrentUserServer } from '../../features/auth/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <KdsTopbar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
