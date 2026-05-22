import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

/// Estado inmutable del board KDS.
sealed class BoardState {
  const BoardState();
}

final class BoardLoading extends BoardState {
  const BoardLoading();
}

final class BoardData extends BoardState {
  const BoardData(this.orders);
  final List<KitchenOrderModel> orders;
}

final class BoardError extends BoardState {
  const BoardError(this.failure);
  final FailureViewData failure;
}

/// Controller Riverpod 3 del board. Hace polling cada 5 s.
class BoardController extends Notifier<BoardState> {
  Timer? _timer;

  /// El WS `/ws/kds` es el canal primario de tiempo real. Este polling es
  /// solo red de seguridad por si el socket se cae sin avisar.
  static const _pollInterval = Duration(seconds: 30);

  @override
  BoardState build() {
    final socket = ref.read(kdsSocketProvider);
    ref.onDispose(() {
      _timer?.cancel();
      socket.disconnect();
    });
    _load();
    _connectSocket();
    _startPolling();
    return const BoardLoading();
  }

  /// Conecta al WS y recarga la cola en cada evento del backend.
  void _connectSocket() {
    Future(() async {
      final token = await ref.read(dioHttpProvider).getStoredToken();
      if (token == null) return;
      ref.read(kdsSocketProvider).connect(token: token, onChange: _load);
    });
  }

  void _startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(_pollInterval, (_) => _load());
  }

  Future<void> _load() async {
    final useCase = ref.read(getKitchenOrdersUseCaseProvider);
    final result = await useCase();

    result.fold(
      (failure) {
        // Mantiene datos viejos si ya había cargado; solo pasa a error en loading.
        if (state is BoardLoading) {
          state = BoardError(mapFailureToView(failure));
        }
      },
      (orders) {
        final sorted = [...orders]..sort((a, b) {
            final sr = _statusRank(a.status) - _statusRank(b.status);
            if (sr != 0) return sr;
            final ta = a.paidAt ?? a.createdAt;
            final tb = b.paidAt ?? b.createdAt;
            return ta.compareTo(tb);
          });
        state = BoardData(sorted);
      },
    );
  }

  int _statusRank(KitchenStatus s) => switch (s) {
        KitchenStatus.pagado => 0,
        KitchenStatus.enPreparacion => 1,
        KitchenStatus.listoDespacho => 2,
      };

  Future<void> startOrder(String id) async {
    final useCase = ref.read(startOrderUseCaseProvider);
    await useCase(id);
    await _load();
  }

  Future<void> readyOrder(String id) async {
    final useCase = ref.read(readyOrderUseCaseProvider);
    await useCase(id);
    await _load();
  }
}

final boardControllerProvider = NotifierProvider<BoardController, BoardState>(
  BoardController.new,
);
