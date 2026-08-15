import { CajaScreen } from '../../../features/caja-shifts';
import { getCurrentShiftStatusServer } from '../../../features/caja-shifts/server';

export const dynamic = 'force-dynamic';

/**
 * No redirige cuando no hay turno: al cerrar, el refresh volvía a correr esta
 * página sin turno y el redirect dejaba la vista en blanco. `CajaScreen`
 * resuelve los tres estados (turno abierto, recién cerrado, sin turno).
 */
export default async function CajaCierrePage() {
  const { shift } = await getCurrentShiftStatusServer();
  return (
    <div className="mx-auto h-full w-full max-w-lg overflow-y-auto p-4">
      <h1 className="caps mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
        Caja del turno
      </h1>
      <CajaScreen shift={shift} />
    </div>
  );
}
