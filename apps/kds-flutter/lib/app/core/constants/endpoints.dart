/// Endpoints de la API NestJS consumidos por el KDS.
abstract class Endpoints {
  // Auth
  static const String login = '/auth/login';

  // KDS
  static const String kdsOrders = '/kds/orders';
  static String kdsOrderStart(String id) => '/kds/orders/$id/start';
  static String kdsOrderReady(String id) => '/kds/orders/$id/ready';

  // WebSocket namespace (socket.io)
  static const String kdsWsNamespace = '/ws/kds';
}
