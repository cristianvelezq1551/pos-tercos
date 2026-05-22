import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/data/sources/auth_api_provider.dart';
import 'package:kds/app/domain/models/auth/login_response_model.dart';
import 'package:kds/app/domain/repositories/auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({required DioHttpProvider http})
      : _provider = AuthApiProvider(http: http);

  final AuthApiProvider _provider;

  @override
  Future<Either<Failure, LoginResponseModel>> login({
    required String email,
    required String password,
  }) {
    return _provider.login(email: email, password: password);
  }
}
