import { Display } from '../features/display';
import { getInitialDisplayState } from '../features/display/server';

// Sin cache: siempre fresco al primer render. El SSE se encarga del live.
export const dynamic = 'force-dynamic';

export default async function PublicDisplayPage() {
  const initial = await getInitialDisplayState();
  return <Display initial={initial} />;
}
