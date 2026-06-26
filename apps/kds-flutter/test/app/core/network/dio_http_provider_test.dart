import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/failure.dart';

/// Storage en memoria (sin keychain real) que solo implementa lo que usa el provider.
class _FakeStorage extends Fake implements FlutterSecureStorage {
  final Map<String, String> data = {};

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      data[key];

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      data.remove(key);
    } else {
      data[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    data.remove(key);
  }
}

/// HttpClientAdapter falso: controla las respuestas para reproducir
/// 401 → refresh → retry sin red. Cuenta los refrescos (single-flight).
class _FakeAdapter implements HttpClientAdapter {
  int refreshCalls = 0;
  bool refreshSucceeds = true;
  String? retryAuthHeader;

  static const _json = {
    Headers.contentTypeHeader: ['application/json; charset=utf-8'],
  };

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path == Endpoints.authRefresh) {
      refreshCalls++;
      if (!refreshSucceeds) {
        return ResponseBody.fromString('{"message":"invalid"}', 401, headers: _json);
      }
      return ResponseBody.fromString(
        '{"accessToken":"NEW_TOKEN"}',
        200,
        headers: {
          ..._json,
          'set-cookie': ['pos_refresh=rotated_refresh; HttpOnly; Path=/'],
        },
      );
    }
    // Endpoint de datos: el primer intento (token viejo) da 401; el retry
    // (marcado con extra['retried']) ya lleva el token nuevo → 200.
    if (!options.extra.containsKey('retried')) {
      return ResponseBody.fromString('{"message":"unauthorized"}', 401, headers: _json);
    }
    retryAuthHeader = options.headers['Authorization'] as String?;
    return ResponseBody.fromString('{"ok":true}', 200, headers: _json);
  }
}

DioHttpProvider _build(_FakeStorage storage, _FakeAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
    ..httpClientAdapter = adapter;
  return DioHttpProvider(storage: storage, dio: dio);
}

void main() {
  group('DioHttpProvider · refresh transparente ante 401', () {
    test('un 401 dispara refresh, reintenta con el token nuevo y devuelve Right', () async {
      final storage = _FakeStorage()
        ..data['access_token'] = 'OLD'
        ..data['refresh_token'] = 'r1';
      final adapter = _FakeAdapter();
      final provider = _build(storage, adapter);

      final result = await provider.get<dynamic>('/kds/orders', converter: (j) => j);

      expect(result.isRight, isTrue);
      expect(adapter.refreshCalls, 1);
      // El retry usó el token nuevo, no el viejo.
      expect(adapter.retryAuthHeader, 'Bearer NEW_TOKEN');
      // El access token quedó persistido + el refresh rotado capturado del Set-Cookie.
      expect(storage.data['access_token'], 'NEW_TOKEN');
      expect(storage.data['refresh_token'], 'rotated_refresh');
    });

    test('dos 401 concurrentes comparten UN solo refresh (single-flight)', () async {
      final storage = _FakeStorage()
        ..data['access_token'] = 'OLD'
        ..data['refresh_token'] = 'r1';
      final adapter = _FakeAdapter();
      final provider = _build(storage, adapter);

      final results = await Future.wait([
        provider.get<dynamic>('/kds/orders', converter: (j) => j),
        provider.get<dynamic>('/subproducts/production-status', converter: (j) => j),
      ]);

      expect(results.every((r) => r.isRight), isTrue);
      // Clave: un solo refresh para los dos 401 (no se rota el token dos veces).
      expect(adapter.refreshCalls, 1);
    });

    test('si el refresh falla, cierra la sesión y devuelve AuthFailure', () async {
      final storage = _FakeStorage()
        ..data['access_token'] = 'OLD'
        ..data['refresh_token'] = 'r1';
      final adapter = _FakeAdapter()..refreshSucceeds = false;
      final provider = _build(storage, adapter);

      final result = await provider.get<dynamic>('/kds/orders', converter: (j) => j);

      expect(result.isLeft, isTrue);
      result.fold((f) => expect(f, isA<AuthFailure>()), (_) => fail('esperaba Left'));
      // Sesión cerrada: access + refresh borrados (el router manda a /login).
      expect(storage.data.containsKey('access_token'), isFalse);
      expect(storage.data.containsKey('refresh_token'), isFalse);
    });

    test('sin refresh token guardado, un 401 no intenta refrescar', () async {
      final storage = _FakeStorage()..data['access_token'] = 'OLD';
      final adapter = _FakeAdapter();
      final provider = _build(storage, adapter);

      final result = await provider.get<dynamic>('/kds/orders', converter: (j) => j);

      expect(result.isLeft, isTrue);
      expect(adapter.refreshCalls, 0);
    });
  });
}
