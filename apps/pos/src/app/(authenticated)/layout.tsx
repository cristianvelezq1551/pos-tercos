import { PosTopbar } from '../../components/PosTopbar';
import { getCurrentUserServer } from '../../features/auth/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <PosTopbar user={user} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
