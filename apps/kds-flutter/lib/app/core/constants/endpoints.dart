/// Endpoints de la API NestJS consumidos por el KDS.
abstract class Endpoints {
  // Auth
  static const String login = '/auth/login';
  static const String authRefresh = '/auth/refresh';

  // KDS
  static const String kdsOrders = '/kds/orders';
  static String kdsOrderStart(String id) => '/kds/orders/$id/start';
  static String kdsOrderReady(String id) => '/kds/orders/$id/ready';

  // Producción (inventario de subproductos)
  // Endpoint único accesible al cocinero: subproductos activos + stock + umbral.
  // (Antes se combinaba /subproducts + /inventory/stock, pero /inventory/stock
  // pasó a ser admin-only en el hardening de seguridad.)
  static const String productionStatus = '/subproducts/production-status';
  static String produceSubproduct(String id) => '/subproducts/$id/produce';

  // WebSocket namespace (socket.io)
  static const String kdsWsNamespace = '/ws/kds';
}
