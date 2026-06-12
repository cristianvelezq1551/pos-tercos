import { ArqueosPanel } from '../../../features/shifts';

export const dynamic = 'force-dynamic';

export default function ArqueosPage() {
  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto p-4">
      <h1 className="caps mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        Historial de arqueos
      </h1>
      <ArqueosPanel />
    </div>
  );
}
