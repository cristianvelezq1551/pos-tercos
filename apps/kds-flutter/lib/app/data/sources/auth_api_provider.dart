import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/auth/login_response_model.dart';

class AuthApiProvider {
  AuthApiProvider({required DioHttpProvider http}) : _http = http;

  final DioHttpProvider _http;

  Future<Either<Failure, LoginResponseModel>> login({
    required String email,
    required String password,
  }) {
    return _http.post<LoginResponseModel>(
      Endpoints.login,
      data: {'email': email, 'password': password},
      converter: (json) => LoginResponseModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
