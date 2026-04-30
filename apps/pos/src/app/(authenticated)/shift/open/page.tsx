import { redirect } from 'next/navigation';
import { OpenShiftForm } from '../../../../features/shifts';
import { getCurrentShiftServer } from '../../../../features/shifts/server';

export default async function OpenShiftPage() {
  const shift = await getCurrentShiftServer();
  if (shift) {
    redirect('/');
  }
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 p-6">
      <OpenShiftForm />
    </div>
  );
}
