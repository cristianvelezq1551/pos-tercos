import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';

/// Estado inmutable de la pantalla de producción.
sealed class ProductionState {
  const ProductionState();
}

final class ProductionLoading extends ProductionState {
  const ProductionLoading();
}

final class ProductionData extends ProductionState {
  const ProductionData(this.subproducts, {this.stale = false});
  final List<ProducibleSubproductModel> subproducts;
  final bool stale;
}

final class ProductionFatal extends ProductionState {
  const ProductionFatal(this.failure);
  final FailureViewData failure;
}

final class ProductionSessionExpired extends ProductionState {
  const ProductionSessionExpired();
}

class ProductionController extends Notifier<ProductionState> {
  bool _sessionEnded = false;
  /// Sub-pago en curso de "producir" para evitar doble-tap.
  final Set<String> _producingIds = {};

  @override
  ProductionState build() {
    _load();
    return const ProductionLoading();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    if (_sessionEnded) return;
    final useCase = ref.read(listProduciblesUseCaseProvider);
    final result = await useCase();
    if (_sessionEnded) return;

    result.fold(
      (failure) {
        if (failure is AuthFailure) {
          _sessionEnded = true;
          ref.read(dioHttpProvider).clearSession();
          state = const ProductionSessionExpired();
          return;
        }
        final current = state;
        if (current is ProductionData) {
          state = ProductionData(current.subproducts, stale: true);
        } else if (current is ProductionLoading) {
          state = ProductionFatal(mapFailureToView(failure));
        }
      },
      (list) => state = ProductionData(list),
    );
  }

  /// Registra una tanda. Devuelve null en éxito o el Failure para la UI.
  /// Refresca la lista al ser exitoso.
  Future<({Failure? failure, ProductionRunModel? run})> produce({
    required String subproductId,
    required double quantityProduced,
    String? notes,
    String? idempotencyKey,
  }) async {
    if (_producingIds.contains(subproductId)) {
      return (failure: null, run: null);
    }
    _producingIds.add(subproductId);
    try {
      final useCase = ref.read(produceSubproductUseCaseProvider);
      final result = await useCase(
        subproductId: subproductId,
        quantityProduced: quantityProduced,
        notes: notes,
        idempotencyKey: idempotencyKey,
      );
      return result.fold(
        (failure) => (failure: failure, run: null),
        (run) {
          // Re-cargar la lista para reflejar el nuevo stock.
          _load();
          return (failure: null, run: run);
        },
      );
    } finally {
      _producingIds.remove(subproductId);
    }
  }
}

final productionControllerProvider =
    NotifierProvider<ProductionController, ProductionState>(
  ProductionController.new,
);
