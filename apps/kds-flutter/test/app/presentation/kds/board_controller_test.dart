import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/core/network/kds_socket.dart';
import 'package:kds/app/core/sound/sound_service.dart';
import 'package:kds/app/data/use_cases/get_kitchen_orders_use_case.dart';
import 'package:kds/app/data/use_cases/ready_order_use_case.dart';
import 'package:kds/app/data/use_cases/start_order_use_case.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/presentation/kds/board_controller.dart';
import 'package:mocktail/mocktail.dart';

class MockKdsSocket extends Mock implements KdsSocket {}

class MockDioHttpProvider extends Mock implements DioHttpProvider {}

class MockSoundService extends Mock implements SoundService {}

class MockGetKitchenOrdersUseCase extends Mock
    implements GetKitchenOrdersUseCase {}

class MockStartOrderUseCase extends Mock implements StartOrderUseCase {}

class MockReadyOrderUseCase extends Mock implements ReadyOrderUseCase {}

KitchenOrderModel buildOrder(
  String id, {
  KitchenStatus status = KitchenStatus.pagado,
  int receiptNumber = 1,
  int? turnNumber = 1,
  DateTime? paidAt,
  DateTime? createdAt,
}) =>
    KitchenOrderModel(
      id: id,
      receiptNumber: receiptNumber,
      turnNumber: turnNumber,
      type: OrderType.counter,
      status: status,
      paidAt: paidAt,
      createdAt: createdAt ?? DateTime(2026, 6, 9, 12),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockKdsSocket socket;
  late MockDioHttpProvider http;
  late MockSoundService sound;
  late MockGetKitchenOrdersUseCase getOrders;
  late MockStartOrderUseCase startOrder;
  late MockReadyOrderUseCase readyOrder;

  setUpAll(() {
    // Silencia HapticFeedback (canal de plataforma) en el entorno de test.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (_) async => null);
  });

  setUp(() {
    socket = MockKdsSocket();
    http = MockDioHttpProvider();
    sound = MockSoundService();
    getOrders = MockGetKitchenOrdersUseCase();
    startOrder = MockStartOrderUseCase();
    readyOrder = MockReadyOrderUseCase();

    // Sin token guardado → el controller no intenta conectar el socket real.
    when(http.getStoredToken).thenAnswer((_) async => null);
    when(http.clearSession).thenAnswer((_) async {});
    when(sound.playBell).thenAnswer((_) async {});
    when(() => sound.playBellThenSpeak(any())).thenAnswer((_) async {});
  });

  ProviderContainer makeContainer() => ProviderContainer(
        overrides: [
          kdsSocketProvider.overrideWithValue(socket),
          dioHttpProvider.overrideWithValue(http),
          soundServiceProvider.overrideWithValue(sound),
          getKitchenOrdersUseCaseProvider.overrideWithValue(getOrders),
          startOrderUseCaseProvider.overrideWithValue(startOrder),
          readyOrderUseCaseProvider.overrideWithValue(readyOrder),
        ],
      );

  Future<void> pump([int times = 4]) async {
    for (var i = 0; i < times; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  group('carga inicial', () {
    test('ordena por status (pagado → enPreparacion → listo) y FIFO por paidAt',
        () async {
      final orders = [
        buildOrder('listo', status: KitchenStatus.listoDespacho,
            paidAt: DateTime(2026, 6, 9, 11)),
        buildOrder('pagado-tarde', paidAt: DateTime(2026, 6, 9, 12, 10)),
        buildOrder('en-prep', status: KitchenStatus.enPreparacion,
            paidAt: DateTime(2026, 6, 9, 11, 30)),
        buildOrder('pagado-temprano', paidAt: DateTime(2026, 6, 9, 12, 5)),
      ];
      when(getOrders.call).thenAnswer((_) async => Right(orders));

      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(boardControllerProvider);
      await pump();

      final state = container.read(boardControllerProvider);
      expect(state, isA<BoardData>());
      final ids = (state as BoardData).orders.map((o) => o.id).toList();
      expect(ids, ['pagado-temprano', 'pagado-tarde', 'en-prep', 'listo']);
      expect(state.stale, isFalse);
    });

    test('usa createdAt como fallback de orden cuando paidAt es null', () async {
      final orders = [
        buildOrder('b', createdAt: DateTime(2026, 6, 9, 12, 30)),
        buildOrder('a', createdAt: DateTime(2026, 6, 9, 12)),
      ];
      when(getOrders.call).thenAnswer((_) async => Right(orders));

      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(boardControllerProvider);
      await pump();

      final state = container.read(boardControllerProvider) as BoardData;
      expect(state.orders.map((o) => o.id).toList(), ['a', 'b']);
    });

    test('falla la primera carga → BoardError con mensaje legible', () async {
      when(getOrders.call)
          .thenAnswer((_) async => const Left(NetworkFailure()));

      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(boardControllerProvider);
      await pump();

      final state = container.read(boardControllerProvider);
      expect(state, isA<BoardError>());
      expect(
        (state as BoardError).failure.message,
        'Sin conexión. Verificá la red.',
      );
    });

    test('AuthFailure → BoardSessionExpired y limpia la sesión', () async {
      when(getOrders.call).thenAnswer((_) async => const Left(AuthFailure()));

      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(boardControllerProvider);
      await pump();

      expect(
        container.read(boardControllerProvider),
        isA<BoardSessionExpired>(),
      );
      verify(http.clearSession).called(1);
      verify(socket.disconnect).called(greaterThanOrEqualTo(1));
    });

    test('no suena campana en la primera carga aunque haya cola llena',
        () async {
      when(getOrders.call).thenAnswer(
        (_) async => Right([buildOrder('a'), buildOrder('b')]),
      );

      final container = makeContainer();
      addTearDown(container.dispose);
      container.read(boardControllerProvider);
      await pump();

      verifyNever(sound.playBell);
    });
  });

  group('recargas (vía transición exitosa)', () {
    test('refresh fallido conserva las órdenes y marca stale=true', () async {
      var calls = 0;
      when(getOrders.call).thenAnswer((_) async {
        calls++;
        return calls == 1
            ? Right([buildOrder('a')])
            : const Left(ApiFailure(message: 'boom', statusCode: 500));
      });
      when(() => startOrder('a')).thenAnswer(
        (_) async => Right(buildOrder('a', status: KitchenStatus.enPreparacion)),
      );

      final container = makeContainer();
      addTearDown(container.dispose);
      final controller = container.read(boardControllerProvider.notifier);
      await pump();

      await controller.startOrder('a');
      await pump();

      final state = container.read(boardControllerProvider);
      expect(state, isA<BoardData>());
      expect((state as BoardData).stale, isTrue);
      expect(state.orders.single.id, 'a',
          reason: 'mantiene los datos viejos en pantalla');
    });

    test('campana + nueva orden cuando aparece un id desconocido', () async {
      var calls = 0;
      when(getOrders.call).thenAnswer((_) async {
        calls++;
        return calls == 1
            ? Right([buildOrder('a')])
            : Right([buildOrder('a'), buildOrder('b')]);
      });
      when(() => startOrder('a')).thenAnswer(
        (_) async => Right(buildOrder('a', status: KitchenStatus.enPreparacion)),
      );

      final container = makeContainer();
      addTearDown(container.dispose);
      final controller = container.read(boardControllerProvider.notifier);
      await pump();
      verifyNever(sound.playBell);

      await controller.startOrder('a');
      await pump();

      verify(sound.playBell).called(1);
      final state = container.read(boardControllerProvider) as BoardData;
      expect(state.orders, hasLength(2));
    });
  });

  group('transiciones start/ready', () {
    test('startOrder devuelve el Failure del use case y NO recarga', () async {
      when(getOrders.call).thenAnswer((_) async => Right([buildOrder('a')]));
      const failure = ApiFailure(message: 'Transición inválida', statusCode: 409);
      when(() => startOrder('a')).thenAnswer((_) async => const Left(failure));

      final container = makeContainer();
      addTearDown(container.dispose);
      final controller = container.read(boardControllerProvider.notifier);
      await pump();

      final result = await controller.startOrder('a');
      await pump();

      expect(result, same(failure));
      verify(getOrders.call).called(1); // solo la carga inicial
    });

    test('readyOrder exitoso devuelve null y recarga la cola', () async {
      when(getOrders.call).thenAnswer((_) async => Right([buildOrder('a')]));
      when(() => readyOrder('a')).thenAnswer(
        (_) async =>
            Right(buildOrder('a', status: KitchenStatus.listoDespacho)),
      );

      final container = makeContainer();
      addTearDown(container.dispose);
      final controller = container.read(boardControllerProvider.notifier);
      await pump();

      final result = await controller.readyOrder('a');
      await pump();

      expect(result, isNull);
      verify(() => readyOrder('a')).called(1);
      verify(getOrders.call).called(2); // inicial + post-transición
    });

    test('guard anti doble-tap: segunda llamada con la misma orden en vuelo '
        'no dispara el use case de nuevo', () async {
      when(getOrders.call).thenAnswer((_) async => Right([buildOrder('a')]));
      final completer = Completer<Either<Failure, KitchenOrderModel>>();
      when(() => startOrder('a')).thenAnswer((_) => completer.future);

      final container = makeContainer();
      addTearDown(container.dispose);
      final controller = container.read(boardControllerProvider.notifier);
      await pump();

      final first = controller.startOrder('a');
      final second = await controller.startOrder('a');

      expect(second, isNull, reason: 'la segunda se ignora silenciosamente');
      verify(() => startOrder('a')).called(1);

      completer.complete(
        Right(buildOrder('a', status: KitchenStatus.enPreparacion)),
      );
      expect(await first, isNull);
    });
  });

  group('recordatorios de urgencia', () {
    test(
        'PAGADO >3min y EN_PREPARACION >10min disparan campana+voz con el '
        'número de turno (fallback al recibo), sin repetir antes de 2min', () {
      fakeAsync((async) {
        final now = DateTime.now();
        final orders = [
          // 5 min sin iniciar → "no ha sido iniciado" con turno 7.
          buildOrder('viejo',
              turnNumber: 7,
              paidAt: now.subtract(const Duration(minutes: 5))),
          // 12 min en preparación y SIN turno → usa el recibo 99.
          buildOrder('demorado',
              status: KitchenStatus.enPreparacion,
              turnNumber: null,
              receiptNumber: 99,
              paidAt: now.subtract(const Duration(minutes: 12))),
          // Recién pagado → no debe sonar.
          buildOrder('fresco', turnNumber: 8, paidAt: now),
        ];
        when(getOrders.call).thenAnswer((_) async => Right(orders));

        final container = makeContainer();
        container.read(boardControllerProvider);
        async.flushMicrotasks(); // completa la carga inicial

        // Primer tick del timer de recordatorios (cada 30s).
        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();

        verify(
          () => sound.playBellThenSpeak(
            'Pedido número 7 no ha sido iniciado',
          ),
        ).called(1);
        verify(
          () => sound.playBellThenSpeak(
            'Pedido número 99 aún no se ha finalizado',
          ),
        ).called(1);

        // Segundo tick 30s después: dentro de la ventana de repetición de
        // 2 min → no debe volver a sonar.
        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();
        verifyNever(() => sound.playBellThenSpeak(any()));

        container.dispose();
        async.flushTimers(flushPeriodicTimers: false);
      });
    });

    test('un pedido recién pagado no genera recordatorios', () {
      fakeAsync((async) {
        final now = DateTime.now();
        when(getOrders.call).thenAnswer(
          (_) async => Right([buildOrder('fresco', paidAt: now)]),
        );

        final container = makeContainer();
        container.read(boardControllerProvider);
        async.flushMicrotasks();

        async.elapse(const Duration(seconds: 30));
        async.flushMicrotasks();

        verifyNever(() => sound.playBellThenSpeak(any()));

        container.dispose();
        async.flushTimers(flushPeriodicTimers: false);
      });
    });
  });
}
