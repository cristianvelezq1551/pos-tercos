import { PosTopbar } from '../../components/PosTopbar';
import { getCurrentUserServer } from '../../features/auth/server';
import { getCurrentShiftServer } from '../../features/shifts/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, shift] = await Promise.all([getCurrentUserServer(), getCurrentShiftServer()]);
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <PosTopbar user={user} shift={shift} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
