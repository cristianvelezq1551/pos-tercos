import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/domain/models/auth/login_response_model.dart';
import 'package:kds/app/domain/models/auth/user_model.dart';

void main() {
  test('LoginResponseModel.fromJson parsea user + accessToken', () {
    final resp = LoginResponseModel.fromJson(<String, dynamic>{
      'user': {
        'id': 'u1',
        'email': 'cocinero@dev.local',
        'fullName': 'Cocinero Dev',
        'role': 'COCINERO',
      },
      'accessToken': 'jwt-token',
    });

    expect(resp.accessToken, 'jwt-token');
    expect(resp.user.email, 'cocinero@dev.local');
    expect(resp.user.role, 'COCINERO');
  });

  test('UserModel.fromJson usa el email como fallback de fullName', () {
    final user = UserModel.fromJson(<String, dynamic>{
      'id': 'u2',
      'email': 'cocinero@dev.local',
      'role': 'COCINERO',
    });

    expect(user.fullName, 'cocinero@dev.local');
  });
}
