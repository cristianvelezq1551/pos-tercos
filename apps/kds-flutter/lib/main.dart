import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/router/app_router.dart';
import 'package:kds/app/core/theme/app_theme.dart';

void main() {
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
