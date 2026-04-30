import { KdsTopbar } from '../../components/KdsTopbar';
import { getCurrentUserServer } from '../../features/auth/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <KdsTopbar user={user} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
