import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:kds/app/core/config/app_config.dart';
import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';

/// Adaptador Dio que convierte respuestas/errores a [Either].
///
/// Mantiene la sesión viva sin intervención del usuario:
/// - Inyecta el Bearer (access token, TTL 15 min) en cada request.
/// - Captura el refresh token (cookie httpOnly `pos_refresh`, TTL 7 días con
///   rotación) del `Set-Cookie` de login y refresh.
/// - Ante un 401, refresca el access token contra `/auth/refresh` (single-flight)
///   y reintenta el request original de forma transparente.
class DioHttpProvider {
  DioHttpProvider({required FlutterSecureStorage storage})
      : _storage = storage,
        _dio = Dio(
          BaseOptions(
            baseUrl: AppConfig.baseUrl,
            connectTimeout: Duration(seconds: AppConfig.connectTimeoutSec),
            receiveTimeout: Duration(seconds: AppConfig.receiveTimeoutSec),
            headers: {'Content-Type': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) async {
          await _captureRefreshCookie(response.headers);
          handler.next(response);
        },
        onError: (err, handler) async {
          final retried = await _maybeRefreshAndRetry(err);
          if (retried != null) {
            handler.resolve(retried);
            return;
          }
          handler.next(err);
        },
      ),
    );
  }

  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const _tokenKey = 'access_token';
  static const _refreshKey = 'refresh_token';

  // Garantiza un único refresh concurrente: múltiples 401 simultáneos esperan
  // el mismo Future en vez de disparar N refrescos (y rotar el token N veces).
  Future<String?>? _refreshInFlight;

  Future<String?> getStoredToken() => _storage.read(key: _tokenKey);
  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  /// Borra access + refresh. La sesión queda cerrada (router manda a /login).
  Future<void> clearSession() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshKey);
  }

  /// Fuerza un refresh del access token. Lo usa el WebSocket al recibir
  /// `auth.error`. Devuelve el token nuevo, o null si el refresh falló
  /// (refresh token vencido/rotado → sesión definitivamente expirada).
  Future<String?> forceRefresh() => _refreshAccessToken();

  Future<Either<Failure, T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(dynamic json) converter,
  }) async {
    try {
      final options = await _buildOptions();
      final response = await _dio.get(
        path,
        queryParameters: queryParameters,
        options: options,
      );
      return Right(converter(response.data));
    } on DioException catch (e) {
      return Left(_mapDioError(e));
    } catch (e) {
      return Left(UnknownFailure(message: e.toString()));
    }
  }

  Future<Either<Failure, T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? extraHeaders,
    required T Function(dynamic json) converter,
  }) async {
    try {
      final options = await _buildOptions(extraHeaders: extraHeaders);
      final response = await _dio.post(path, data: data, options: options);
      return Right(converter(response.data));
    } on DioException catch (e) {
      return Left(_mapDioError(e));
    } catch (e) {
      return Left(UnknownFailure(message: e.toString()));
    }
  }

  Future<Options> _buildOptions({Map<String, dynamic>? extraHeaders}) async {
    final token = await _storage.read(key: _tokenKey);
    final headers = <String, dynamic>{
      if (token != null) 'Authorization': 'Bearer $token',
      ...?extraHeaders,
    };
    return Options(headers: headers);
  }

  // ── Refresh transparente ──────────────────────────────────────────────────

  /// Si el error es un 401 recuperable, refresca y reintenta el request
  /// original UNA vez. Devuelve la respuesta del retry, o null si no aplica.
  Future<Response<dynamic>?> _maybeRefreshAndRetry(DioException err) async {
    final req = err.requestOptions;
    final isAuthCall =
        req.path == Endpoints.authRefresh || req.path == Endpoints.login;
    if (err.response?.statusCode != 401 ||
        isAuthCall ||
        req.extra.containsKey('retried')) {
      return null;
    }

    final newToken = await _refreshAccessToken();
    if (newToken == null) return null;

    req.headers['Authorization'] = 'Bearer $newToken';
    req.extra['retried'] = true;
    try {
      return await _dio.fetch(req);
    } on DioException {
      return null;
    }
  }

  Future<String?> _refreshAccessToken() {
    return _refreshInFlight ??=
        _doRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<String?> _doRefresh() async {
    final refresh = await _storage.read(key: _refreshKey);
    if (refresh == null) return null;
    try {
      final resp = await _dio.post(
        Endpoints.authRefresh,
        options: Options(
          headers: {'Cookie': 'pos_refresh=$refresh'},
          extra: {'retried': true},
        ),
      );
      final access = (resp.data as Map<String, dynamic>?)?['accessToken'];
      if (access is! String) return null;
      await _storage.write(key: _tokenKey, value: access);
      // El interceptor onResponse ya guardó el `pos_refresh` rotado.
      return access;
    } on DioException {
      await clearSession();
      return null;
    }
  }

  Future<void> _captureRefreshCookie(Headers headers) async {
    final cookies = headers.map['set-cookie'];
    if (cookies == null) return;
    for (final raw in cookies) {
      final match = RegExp(r'pos_refresh=([^;]+)').firstMatch(raw);
      if (match != null) {
        await _storage.write(key: _refreshKey, value: match.group(1));
        return;
      }
    }
  }

  // ── Mapeo de errores ──────────────────────────────────────────────────────

  Failure _mapDioError(DioException e) {
    return switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.sendTimeout =>
        const TimeoutFailure(),
      DioExceptionType.connectionError => const NetworkFailure(),
      DioExceptionType.badResponse => _mapStatusCode(e.response?.statusCode),
      _ => UnknownFailure(message: e.message ?? 'Error de red desconocido.'),
    };
  }

  Failure _mapStatusCode(int? code) {
    if (code == null) return const UnknownFailure();
    return switch (code) {
      400 || 401 || 403 => const AuthFailure(),
      404 => const ApiFailure(message: 'Recurso no encontrado.', statusCode: 404),
      >= 500 => ApiFailure(message: 'Error del servidor ($code).', statusCode: code),
      _ => ApiFailure(message: 'Error HTTP $code.', statusCode: code),
    };
  }
}
