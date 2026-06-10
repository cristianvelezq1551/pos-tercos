import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/core/network/failure.dart';

void main() {
  group('mapFailureToView', () {
    test('mapea cada tipo técnico a su mensaje legible', () {
      expect(
        mapFailureToView(const NetworkFailure()).message,
        'Sin conexión. Verificá la red.',
      );
      expect(
        mapFailureToView(const TimeoutFailure()).message,
        'La solicitud tardó demasiado. Reintentá.',
      );
      expect(
        mapFailureToView(const AuthFailure()).message,
        'Sesión inválida. Iniciá sesión de nuevo.',
      );
      expect(
        mapFailureToView(const UnknownFailure()).message,
        'Error inesperado. Contactá soporte.',
      );
    });

    test('ApiFailure conserva el mensaje del backend (ej. 409 de producción)', () {
      const failure = ApiFailure(
        message: 'Stock insuficiente: Pollo crudo (faltan 200 g)',
        statusCode: 409,
      );

      expect(
        mapFailureToView(failure).message,
        'Stock insuficiente: Pollo crudo (faltan 200 g)',
      );
    });
  });
}
