import { redirect } from 'next/navigation';
import { CajaPanel } from '../../../features/shifts';
import { getCurrentShiftStatusServer } from '../../../features/shifts/server';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const { shift } = await getCurrentShiftStatusServer();
  if (!shift) redirect('/shift/open');
  return (
    <div className="mx-auto h-full w-full max-w-lg overflow-y-auto p-4">
      <h1 className="caps mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        Caja del turno
      </h1>
      <CajaPanel shift={shift} />
    </div>
  );
}
