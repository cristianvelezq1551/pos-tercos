import { redirect } from 'next/navigation';
import { TurnPanel } from '../../../features/turn';
import { getCurrentShiftStatusServer } from '../../../features/shifts/server';

export default async function TurnosPage() {
  const { shift } = await getCurrentShiftStatusServer();
  if (!shift) redirect('/shift/open');
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col p-4">
      <h1 className="caps mb-3 shrink-0 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        Llamado de turnos
      </h1>
      <div className="min-h-0 flex-1">
        <TurnPanel active />
      </div>
    </div>
  );
}
