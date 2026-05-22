/// Tipos de fallo técnico. La capa domain los retorna; los use cases los
/// convierten a [FailureViewData] con mensaje legible para la UI.
sealed class Failure {
  const Failure({required this.message, this.statusCode});
  final String message;
  final int? statusCode;
}

final class NetworkFailure extends Failure {
  const NetworkFailure({super.message = 'Sin conexión a internet.'});
}

final class TimeoutFailure extends Failure {
  const TimeoutFailure({super.message = 'La solicitud tardó demasiado.'});
}

final class ApiFailure extends Failure {
  const ApiFailure({required super.message, super.statusCode});
}

final class AuthFailure extends Failure {
  const AuthFailure({super.message = 'Sesión inválida o expirada.'});
}

final class UnknownFailure extends Failure {
  const UnknownFailure({super.message = 'Error inesperado.'});
}

/// Versión de Failure con texto listo para mostrar en UI.
class FailureViewData {
  const FailureViewData({required this.message});
  final String message;
}

/// Convierte un [Failure] técnico a [FailureViewData] con mensaje legible.
FailureViewData mapFailureToView(Failure failure) {
  return switch (failure) {
    NetworkFailure() => const FailureViewData(message: 'Sin conexión. Verificá la red.'),
    TimeoutFailure() => const FailureViewData(message: 'La solicitud tardó demasiado. Reintentá.'),
    AuthFailure() => const FailureViewData(message: 'Sesión inválida. Iniciá sesión de nuevo.'),
    ApiFailure(message: final msg) => FailureViewData(message: msg),
    UnknownFailure() => const FailureViewData(message: 'Error inesperado. Contactá soporte.'),
  };
}
