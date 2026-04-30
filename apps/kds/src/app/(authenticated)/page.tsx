import { getAccessTokenServer } from '../../features/auth';
import { OrdersGrid } from '../../features/orders';
import { getKitchenQueueServer } from '../../features/orders/server';

export default async function KdsHomePage() {
  const [initial, wsToken] = await Promise.all([
    getKitchenQueueServer(),
    getAccessTokenServer(),
  ]);
  return <OrdersGrid initial={initial} wsToken={wsToken} />;
}
