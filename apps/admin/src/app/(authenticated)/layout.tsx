import { AdminShell } from '../../components/AdminShell';
import { getCurrentUserServer } from '../../features/auth/server';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserServer();
  return <AdminShell user={user}>{children}</AdminShell>;
}
