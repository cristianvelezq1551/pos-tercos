import { PrinterConfigView } from '../../../features/printing';

export const dynamic = 'force-dynamic';

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto p-4">
      <h1 className="caps mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        Configuración · Impresoras
      </h1>
      <PrinterConfigView />
    </div>
  );
}
