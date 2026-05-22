/// Configuración central de la app KDS.
///
/// Para emulador Android: usar `http://10.0.2.2:3001`
/// Para tablet física en la misma red: cambiar a `http://192.168.1.X:3001`
abstract class AppConfig {
  /// URL base de la API NestJS.
  // ignore: constant_identifier_names
  static const String baseUrl = 'http://10.0.2.2:3001';

  /// URL del WebSocket (mismo host que la API).
  static const String wsUrl = baseUrl;

  /// Nombre de la app mostrado en la UI.
  static const String appName = 'KDS Tercos';

  /// Timeout de requests HTTP en segundos.
  static const int connectTimeoutSec = 15;
  static const int receiveTimeoutSec = 30;
}
