import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:kds/app/domain/models/auth/user_model.dart';

part 'login_response_model.freezed.dart';
part 'login_response_model.g.dart';

/// Respuesta de POST /auth/login.
@freezed
abstract class LoginResponseModel with _$LoginResponseModel {
  const factory LoginResponseModel({
    required UserModel user,
    required String accessToken,
  }) = _LoginResponseModel;

  factory LoginResponseModel.fromJson(Map<String, dynamic> json) =>
      LoginResponseModel(
        user: UserModel.fromJson(json['user'] as Map<String, dynamic>),
        accessToken: json['accessToken'] as String,
      );
}
