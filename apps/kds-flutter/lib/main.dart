import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/router/app_router.dart';
import 'package:kds/app/core/theme/app_theme.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Tablet de cocina: landscape fijo + sin barras del sistema (kiosko).
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  // La pantalla no se duerme mientras el KDS está abierto.
  await WakelockPlus.enable();
  runApp(const ProviderScope(child: KdsApp()));
}

class KdsApp extends ConsumerWidget {
  const KdsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'KDS Tercos',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      routerConfig: router,
    );
  }
}
