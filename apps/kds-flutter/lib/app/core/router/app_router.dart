import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/presentation/auth/login_screen.dart';
import 'package:kds/app/presentation/kds/board_screen.dart';
import 'package:kds/app/presentation/production/production_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final storage = ref.read(secureStorageProvider);

  return GoRouter(
    initialLocation: '/board',
    redirect: (context, state) async {
      final token = await storage.read(key: 'access_token');
      final isLogin = state.matchedLocation == '/login';

      if (token == null && !isLogin) return '/login';
      if (token != null && isLogin) return '/board';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/board',
        builder: (context, state) => const BoardScreen(),
      ),
      GoRoute(
        path: '/production',
        builder: (context, state) => const ProductionScreen(),
      ),
    ],
  );
});
