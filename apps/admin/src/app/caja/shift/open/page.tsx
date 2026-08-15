import { redirect } from 'next/navigation';
import { OpenShiftForm } from '../../../../features/caja-shifts';
import { getCurrentShiftServer } from '../../../../features/caja-shifts/server';

export default async function CajaOpenShiftPage() {
  const shift = await getCurrentShiftServer();
  if (shift) {
    redirect('/caja');
  }
  return (
    // El scroll va en el contenedor y el centrado en el hijo (`min-h-full`):
    // con `items-center` a secas, un teclado abierto o una pantalla baja dejan
    // el botón de abrir turno fuera de alcance y sin forma de bajar.
    <div className="h-full overflow-y-auto bg-muted/40">
      <div className="flex min-h-full items-center justify-center p-6">
        <OpenShiftForm />
      </div>
    </div>
  );
}
