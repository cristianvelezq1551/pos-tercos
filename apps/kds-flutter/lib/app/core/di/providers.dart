import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/kds_socket.dart';
import 'package:kds/app/core/sound/sound_service.dart';
import 'package:kds/app/data/repositories_impl/auth_repository_impl.dart';
import 'package:kds/app/data/repositories_impl/kds_repository_impl.dart';
import 'package:kds/app/data/repositories_impl/production_repository_impl.dart';
import 'package:kds/app/data/use_cases/get_kitchen_orders_use_case.dart';
import 'package:kds/app/data/use_cases/list_producibles_use_case.dart';
import 'package:kds/app/data/use_cases/login_use_case.dart';
import 'package:kds/app/data/use_cases/produce_subproduct_use_case.dart';
import 'package:kds/app/data/use_cases/ready_order_use_case.dart';
import 'package:kds/app/data/use_cases/start_order_use_case.dart';
import 'package:kds/app/domain/repositories/auth_repository.dart';
import 'package:kds/app/domain/repositories/kds_repository.dart';
import 'package:kds/app/domain/repositories/production_repository.dart';

// ── Infrastructure ────────────────────────────────────────────────────────────

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final dioHttpProvider = Provider<DioHttpProvider>(
  (ref) => DioHttpProvider(storage: ref.read(secureStorageProvider)),
);

final kdsSocketProvider = Provider<KdsSocket>((ref) {
  final socket = KdsSocket();
  ref.onDispose(socket.disconnect);
  return socket;
});

final soundServiceProvider = Provider<SoundService>((ref) {
  final service = SoundService();
  ref.onDispose(service.dispose);
  return service;
});

// ── Repositories ──────────────────────────────────────────────────────────────

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepositoryImpl(http: ref.read(dioHttpProvider)),
);

final kdsRepositoryProvider = Provider<KdsRepository>(
  (ref) => KdsRepositoryImpl(http: ref.read(dioHttpProvider)),
);

final productionRepositoryProvider = Provider<ProductionRepository>(
  (ref) => ProductionRepositoryImpl(http: ref.read(dioHttpProvider)),
);

// ── Use cases ─────────────────────────────────────────────────────────────────

final loginUseCaseProvider = Provider<LoginUseCase>(
  (ref) => LoginUseCase(repository: ref.read(authRepositoryProvider)),
);

final getKitchenOrdersUseCaseProvider = Provider<GetKitchenOrdersUseCase>(
  (ref) =>
      GetKitchenOrdersUseCase(repository: ref.read(kdsRepositoryProvider)),
);

final startOrderUseCaseProvider = Provider<StartOrderUseCase>(
  (ref) => StartOrderUseCase(repository: ref.read(kdsRepositoryProvider)),
);

final readyOrderUseCaseProvider = Provider<ReadyOrderUseCase>(
  (ref) => ReadyOrderUseCase(repository: ref.read(kdsRepositoryProvider)),
);

final listProduciblesUseCaseProvider = Provider<ListProduciblesUseCase>(
  (ref) => ListProduciblesUseCase(
    repository: ref.read(productionRepositoryProvider),
  ),
);

final produceSubproductUseCaseProvider = Provider<ProduceSubproductUseCase>(
  (ref) => ProduceSubproductUseCase(
    repository: ref.read(productionRepositoryProvider),
  ),
);
