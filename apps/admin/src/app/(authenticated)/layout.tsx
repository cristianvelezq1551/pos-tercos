import { AdminShell } from '../../components/AdminShell';
import { SessionKeeper } from '../../features/auth';
import { getCurrentUserServer } from '../../features/auth/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return (
    <>
      <SessionKeeper />
      <AdminShell user={user}>{children}</AdminShell>
    </>
  );
}
