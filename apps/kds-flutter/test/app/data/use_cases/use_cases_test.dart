import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/data/use_cases/get_kitchen_orders_use_case.dart';
import 'package:kds/app/data/use_cases/list_producibles_use_case.dart';
import 'package:kds/app/data/use_cases/login_use_case.dart';
import 'package:kds/app/data/use_cases/produce_subproduct_use_case.dart';
import 'package:kds/app/data/use_cases/ready_order_use_case.dart';
import 'package:kds/app/data/use_cases/start_order_use_case.dart';
import 'package:kds/app/domain/models/auth/login_response_model.dart';
import 'package:kds/app/domain/models/auth/user_model.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';
import 'package:kds/app/domain/repositories/auth_repository.dart';
import 'package:kds/app/domain/repositories/kds_repository.dart';
import 'package:kds/app/domain/repositories/production_repository.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class MockKdsRepository extends Mock implements KdsRepository {}

class MockProductionRepository extends Mock implements ProductionRepository {}

KitchenOrderModel buildOrder(String id) => KitchenOrderModel(
      id: id,
      receiptNumber: 1,
      turnNumber: 1,
      type: OrderType.counter,
      status: KitchenStatus.pagado,
      createdAt: DateTime(2026, 6, 9, 12),
    );

void main() {
  group('LoginUseCase', () {
    late MockAuthRepository repo;
    late LoginUseCase useCase;

    setUp(() {
      repo = MockAuthRepository();
      useCase = LoginUseCase(repository: repo);
    });

    test('delega en el repositorio con email y password exactos', () async {
      final response = LoginResponseModel(
        user: const UserModel(
          id: 'u1',
          email: 'cocinero@dev.local',
          fullName: 'Cocinero',
          role: 'COCINERO',
        ),
        accessToken: 'jwt',
      );
      when(() => repo.login(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenAnswer((_) async => Right(response));

      final result =
          await useCase(email: 'cocinero@dev.local', password: 'dev12345');

      expect(result.isRight, isTrue);
      expect(result.fold((l) => null, (r) => r.accessToken), 'jwt');
      verify(() => repo.login(
            email: 'cocinero@dev.local',
            password: 'dev12345',
          )).called(1);
    });

    test('propaga el Failure del repositorio sin transformarlo', () async {
      when(() => repo.login(
            email: any(named: 'email'),
            password: any(named: 'password'),
          )).thenAnswer((_) async => const Left(AuthFailure()));

      final result = await useCase(email: 'x@x.com', password: 'mala');

      expect(result.isLeft, isTrue);
      expect(result.fold((l) => l, (r) => null), isA<AuthFailure>());
    });
  });

  group('GetKitchenOrdersUseCase', () {
    test('devuelve la lista de órdenes del repositorio', () async {
      final repo = MockKdsRepository();
      when(repo.getOrders)
          .thenAnswer((_) async => Right([buildOrder('a'), buildOrder('b')]));

      final result = await GetKitchenOrdersUseCase(repository: repo)();

      expect(result.fold((l) => null, (r) => r.length), 2);
      verify(repo.getOrders).called(1);
    });

    test('propaga NetworkFailure', () async {
      final repo = MockKdsRepository();
      when(repo.getOrders)
          .thenAnswer((_) async => const Left(NetworkFailure()));

      final result = await GetKitchenOrdersUseCase(repository: repo)();

      expect(result.fold((l) => l, (r) => null), isA<NetworkFailure>());
    });
  });

  group('StartOrderUseCase / ReadyOrderUseCase', () {
    test('startOrder delega con el id correcto', () async {
      final repo = MockKdsRepository();
      when(() => repo.startOrder(any()))
          .thenAnswer((_) async => Right(buildOrder('sale-1')));

      final result = await StartOrderUseCase(repository: repo)('sale-1');

      expect(result.isRight, isTrue);
      verify(() => repo.startOrder('sale-1')).called(1);
      verifyNever(() => repo.readyOrder(any()));
    });

    test('readyOrder delega con el id correcto y propaga ApiFailure', () async {
      final repo = MockKdsRepository();
      when(() => repo.readyOrder(any())).thenAnswer(
        (_) async => const Left(
          ApiFailure(message: 'Transición inválida', statusCode: 409),
        ),
      );

      final result = await ReadyOrderUseCase(repository: repo)('sale-2');

      final failure = result.fold((l) => l, (r) => null);
      expect(failure, isA<ApiFailure>());
      expect(failure!.statusCode, 409);
      verify(() => repo.readyOrder('sale-2')).called(1);
    });
  });

  group('ListProduciblesUseCase', () {
    // `yield` (campo del modelo) es palabra reservada dentro de closures
    // async, así que el fixture se construye acá afuera.
    const sub = ProducibleSubproductModel(
      id: 'sub-1',
      name: 'Pollo cocido',
      unit: 'gramos',
      yield: 950,
      thresholdMin: 500,
      currentStock: 100,
      isActive: true,
    );

    test('devuelve los subproductos producibles', () async {
      final repo = MockProductionRepository();
      when(repo.listProducibles).thenAnswer((_) async => const Right([sub]));

      final result = await ListProduciblesUseCase(repository: repo)();

      expect(result.fold((l) => null, (r) => r.single.id), 'sub-1');
      verify(repo.listProducibles).called(1);
    });
  });

  group('ProduceSubproductUseCase', () {
    test('pasa todos los parámetros nombrados al repositorio', () async {
      final repo = MockProductionRepository();
      final run = ProductionRunModel(
        runId: 'run-1',
        subproductId: 'sub-1',
        subproductName: 'Pollo cocido',
        quantityProduced: 950,
        unit: 'gramos',
        createdAt: DateTime(2026, 6, 9),
      );
      when(() => repo.produce(
            subproductId: any(named: 'subproductId'),
            quantityProduced: any(named: 'quantityProduced'),
            notes: any(named: 'notes'),
            idempotencyKey: any(named: 'idempotencyKey'),
          )).thenAnswer((_) async => Right(run));

      final result = await ProduceSubproductUseCase(repository: repo)(
        subproductId: 'sub-1',
        quantityProduced: 950,
        notes: 'tanda de la mañana',
        idempotencyKey: 'idem-1',
      );

      expect(result.fold((l) => null, (r) => r.runId), 'run-1');
      verify(() => repo.produce(
            subproductId: 'sub-1',
            quantityProduced: 950,
            notes: 'tanda de la mañana',
            idempotencyKey: 'idem-1',
          )).called(1);
    });

    test('propaga el 409 de stock insuficiente', () async {
      final repo = MockProductionRepository();
      when(() => repo.produce(
            subproductId: any(named: 'subproductId'),
            quantityProduced: any(named: 'quantityProduced'),
            notes: any(named: 'notes'),
            idempotencyKey: any(named: 'idempotencyKey'),
          )).thenAnswer(
        (_) async => const Left(
          ApiFailure(message: 'Stock insuficiente', statusCode: 409),
        ),
      );

      final result = await ProduceSubproductUseCase(repository: repo)(
        subproductId: 'sub-1',
        quantityProduced: 10,
      );

      final failure = result.fold((l) => l, (r) => null);
      expect(failure, isA<ApiFailure>());
      expect(failure!.statusCode, 409);
    });
  });
}
