import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

// TODO: reemplazar polling por WS /ws/kds con socket_io_client
//   - conectar con socket.io-client al namespace /ws/kds
//   - escuchar eventos 'order.created' y 'order.status.changed'
//   - auth handshake: { token: accessToken } (no cookie cross-origin)

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

  static const _pollInterval = Duration(seconds: 5);

  @override
  BoardState build() {
    // Cancela el timer cuando el provider se destruye.
    ref.onDispose(() => _timer?.cancel());
    _load();
    _startPolling();
    return const BoardLoading();
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
