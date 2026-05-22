/// Configuración central de la app KDS.
///
/// Para tablet física en la misma WiFi: IP del Mac (servidor) + :3001.
/// Para emulador Android sería `http://10.0.2.2:3001`.
/// (Se puede parametrizar con --dart-define=API_URL=... en el futuro.)
abstract class AppConfig {
  /// URL base de la API NestJS. Parametrizable en build:
  ///   flutter run --dart-define=API_URL=http://192.168.1.20:3001
  /// Default = IP del Mac en la red local de dev.
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://192.168.1.4:3001',
  );

  /// URL del WebSocket (mismo host que la API).
  static const String wsUrl = baseUrl;

  /// Nombre de la app mostrado en la UI.
  static const String appName = 'KDS Tercos';

  /// Timeout de requests HTTP en segundos.
  static const int connectTimeoutSec = 15;
  static const int receiveTimeoutSec = 30;
}
