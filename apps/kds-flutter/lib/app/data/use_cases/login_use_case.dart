import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/auth/login_response_model.dart';
import 'package:kds/app/domain/repositories/auth_repository.dart';

class LoginUseCase {
  LoginUseCase({required AuthRepository repository})
      : _repository = repository;

  final AuthRepository _repository;

  Future<Either<Failure, LoginResponseModel>> call({
    required String email,
    required String password,
  }) {
    return _repository.login(email: email, password: password);
  }
}
