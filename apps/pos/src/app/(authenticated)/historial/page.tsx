import { redirect } from 'next/navigation';
import { DayHistoryPanel, VoidSaleAction } from '../../../features/sales';
import { getCurrentShiftStatusServer } from '../../../features/shifts/server';

export default async function HistorialPage() {
  const { shift } = await getCurrentShiftStatusServer();
  if (!shift) redirect('/shift/open');
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h1 className="caps text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          Historial del día
        </h1>
        <VoidSaleAction shiftId={shift.id} />
      </div>
      <div className="min-h-0 flex-1">
        <DayHistoryPanel active />
      </div>
    </div>
  );
}
