import { redirect } from 'next/navigation';
import { OpenShiftForm } from '../../../../features/caja-shifts';
import { getCurrentShiftServer } from '../../../../features/caja-shifts/server';

export default async function CajaOpenShiftPage() {
  const shift = await getCurrentShiftServer();
  if (shift) {
    redirect('/caja');
  }
  return (
    <div className="flex h-full items-center justify-center bg-muted/40 p-6">
      <OpenShiftForm />
    </div>
  );
}
