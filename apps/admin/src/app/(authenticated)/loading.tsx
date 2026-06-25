import { RouteSkeleton } from '../../components/RouteSkeleton';

/**
 * Estado de carga a nivel de ruta (primer ingreso a la app o recarga dura). El
 * cambio ENTRE módulos lo cubre `MainSkeletonGate` en el cliente, porque el
 * Suspense de `loading.tsx` no se re-dispara al navegar dentro del mismo layout.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
