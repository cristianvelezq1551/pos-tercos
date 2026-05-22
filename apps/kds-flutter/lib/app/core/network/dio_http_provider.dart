import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:kds/app/core/config/app_config.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';

/// Adaptador Dio que convierte respuestas/errores a [Either].
/// Inyecta el Bearer token desde [FlutterSecureStorage] en cada request.
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
        );

  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const _tokenKey = 'access_token';

  Future<String?> getStoredToken() => _storage.read(key: _tokenKey);
  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);
  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  Future<Options> _buildOptions({Map<String, dynamic>? extraHeaders}) async {
    final token = await _storage.read(key: _tokenKey);
    final headers = <String, dynamic>{
      if (token != null) 'Authorization': 'Bearer $token',
      ...?extraHeaders,
    };
    return Options(headers: headers);
  }

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
