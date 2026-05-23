import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/either.dart';
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
  const BoardData(this.orders, {this.stale = false});
  final List<KitchenOrderModel> orders;

  /// true cuando el último refresh falló pero seguimos mostrando datos viejos.
  final bool stale;
}

final class BoardError extends BoardState {
  const BoardError(this.failure);
  final FailureViewData failure;
}

/// La sesión venció y no se pudo refrescar (refresh token inválido/rotado).
/// La pantalla reacciona navegando a /login.
final class BoardSessionExpired extends BoardState {
  const BoardSessionExpired();
}

/// Controller Riverpod 3 del board.
class BoardController extends Notifier<BoardState> {
  Timer? _timer;
  Timer? _reminderTimer;
  bool _sessionEnded = false;
  bool _firstLoadDone = false;
  Set<String> _knownOrderIds = {};
  final Set<String> _inFlight = {};
  /// Última vez que sonó el recordatorio de "no iniciado" por orden.
  final Map<String, DateTime> _lastReminded = {};

  /// El WS `/ws/kds` es el canal primario de tiempo real. Este polling es
  /// solo red de seguridad por si el socket se cae sin avisar.
  static const _pollInterval = Duration(seconds: 30);
  /// Un pedido PAGADO que lleva más de esto sin iniciar dispara el recordatorio.
  static const _unstartedReminderAfter = Duration(minutes: 3);

  /// Un pedido EN_PREPARACION que lleva más de esto sin finalizar dispara
  /// el recordatorio de "aún no se ha finalizado".
  static const _unfinishedReminderAfter = Duration(minutes: 10);

  /// Cada cuánto se re-recuerda mientras siga pendiente.
  static const _reminderRepeat = Duration(minutes: 2);

  @override
  BoardState build() {
    final socket = ref.read(kdsSocketProvider);
    ref.onDispose(() {
      _timer?.cancel();
      _reminderTimer?.cancel();
      socket.disconnect();
    });
    _load();
    _connectSocket();
    _startPolling();
    _startReminders();
    return const BoardLoading();
  }

  /// Conecta al WS y recarga la cola en cada evento del backend.
  void _connectSocket() {
    Future(() async {
      final http = ref.read(dioHttpProvider);
      final token = await http.getStoredToken();
      if (token == null) return;
      ref.read(kdsSocketProvider).connect(
            token: token,
            onChange: _load,
            onAuthError: http.forceRefresh,
            onSessionExpired: _handleSessionExpired,
          );
    });
  }

  /// Sesión definitivamente expirada: corta todo y deja a la pantalla mandar
  /// a /login. Idempotente: el socket y un `_load` 401 pueden dispararlo a la vez.
  void _handleSessionExpired() {
    if (_sessionEnded) return;
    _sessionEnded = true;
    _timer?.cancel();
    ref.read(kdsSocketProvider).disconnect();
    ref.read(dioHttpProvider).clearSession();
    state = const BoardSessionExpired();
  }

  void _startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(_pollInterval, (_) => _load());
  }

  Future<void> _load() async {
    if (_sessionEnded) return;
    final useCase = ref.read(getKitchenOrdersUseCaseProvider);
    final result = await useCase();
    if (_sessionEnded) return;

    result.fold(
      (failure) {
        // 401/403 tras un refresh fallido → sesión expirada (a /login).
        if (failure is AuthFailure) {
          _handleSessionExpired();
          return;
        }
        // Mantiene los datos viejos pero marcados como `stale`; solo cae a
        // error si todavía no había cargado nada.
        final current = state;
        if (current is BoardData) {
          state = BoardData(current.orders, stale: true);
        } else if (current is BoardLoading) {
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
        _alertOnNewOrders(sorted);
        state = BoardData(sorted);
      },
    );
  }

  /// Campana fuerte + vibración cuando aparece una orden que no estaba antes
  /// (nunca en la primera carga, para no sonar al abrir la app con la cola llena).
  void _alertOnNewOrders(List<KitchenOrderModel> orders) {
    final ids = orders.map((o) => o.id).toSet();
    if (_firstLoadDone && ids.difference(_knownOrderIds).isNotEmpty) {
      ref.read(soundServiceProvider).playBell();
      HapticFeedback.heavyImpact();
    }
    _knownOrderIds = ids;
    _firstLoadDone = true;
  }

  void _startReminders() {
    _reminderTimer?.cancel();
    _reminderTimer =
        Timer.periodic(const Duration(seconds: 30), (_) => _checkReminders());
  }

  /// Recordatorios sonoros + voz:
  ///  - PAGADO > 3 min sin iniciar → "no ha sido iniciado".
  ///  - EN_PREPARACION > 10 min sin finalizar → "aún no se ha finalizado".
  /// Re-recuerda cada 2 min mientras siga pendiente. Usa el número de TURNO
  /// (el que se le canta al cliente), con fallback al recibo.
  Future<void> _checkReminders() async {
    final s = state;
    if (s is! BoardData) return;
    final now = DateTime.now();
    final sound = ref.read(soundServiceProvider);

    final due = <String>[];
    for (final o in s.orders) {
      final since = o.paidAt ?? o.createdAt;
      final elapsed = now.difference(since);
      final turno = o.turnNumber ?? o.receiptNumber;

      String? key;
      String? message;
      if (o.status == KitchenStatus.pagado && elapsed >= _unstartedReminderAfter) {
        key = 'unstarted:${o.id}';
        message = 'Pedido número $turno no ha sido iniciado';
      } else if (o.status == KitchenStatus.enPreparacion &&
          elapsed >= _unfinishedReminderAfter) {
        key = 'unfinished:${o.id}';
        message = 'Pedido número $turno aún no se ha finalizado';
      }
      if (key == null || message == null) continue;

      final last = _lastReminded[key];
      if (last != null && now.difference(last) < _reminderRepeat) continue;
      _lastReminded[key] = now;
      due.add(message);
    }

    // Secuencial: campana → voz → siguiente. Nunca se superponen.
    for (final message in due) {
      await sound.playBellThenSpeak(message);
    }

    // Limpia recordatorios de pedidos que ya no están en la cola.
    _lastReminded.removeWhere(
      (key, _) => !s.orders.any((o) => key.endsWith(o.id)),
    );
  }

  int _statusRank(KitchenStatus s) => switch (s) {
        KitchenStatus.pagado => 0,
        KitchenStatus.enPreparacion => 1,
        KitchenStatus.listoDespacho => 2,
      };

  /// Inicia una orden. Devuelve null si OK, o el `Failure` para que la UI lo
  /// muestre. Con guard de doble-tap por id.
  Future<Failure?> startOrder(String id) =>
      _transition(id, () => ref.read(startOrderUseCaseProvider)(id));

  /// Marca una orden lista. Mismo contrato que [startOrder].
  Future<Failure?> readyOrder(String id) =>
      _transition(id, () => ref.read(readyOrderUseCaseProvider)(id));

  Future<Failure?> _transition(
    String id,
    Future<Either<Failure, KitchenOrderModel>> Function() action,
  ) async {
    if (_inFlight.contains(id)) return null;
    _inFlight.add(id);
    try {
      final result = await action();
      return result.fold(
        (failure) => failure,
        (_) {
          _load();
          return null;
        },
      );
    } finally {
      _inFlight.remove(id);
    }
  }
}

final boardControllerProvider = NotifierProvider<BoardController, BoardState>(
  BoardController.new,
);

/// Reloj global que tickea cada segundo: una sola fuente para todos los
/// cronómetros de las cards (antes cada card creaba su propio `Timer`).
class NowTicker extends Notifier<DateTime> {
  Timer? _timer;

  @override
  DateTime build() {
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => state = DateTime.now(),
    );
    ref.onDispose(() => _timer?.cancel());
    return DateTime.now();
  }
}

final nowProvider = NotifierProvider<NowTicker, DateTime>(NowTicker.new);
