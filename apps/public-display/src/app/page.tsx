import { Display } from '../features/display';

// Sin cache: el contenido (B-roll + música) se refresca client-side via
// useBrollConfig (consulta /api/display/broll cada 5 min).
export const dynamic = 'force-dynamic';

export default function PublicDisplayPage() {
  return <Display />;
}
