import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';

abstract class ProductionRepository {
  /// Lista los subproductos producibles con su stock actual mergeado.
  /// Combina `GET /subproducts` con `GET /inventory/stock` (filtra SUBPRODUCT).
  Future<Either<Failure, List<ProducibleSubproductModel>>> listProducibles();

  /// Registra una tanda de producción: +N al subproducto y consume insumos.
  /// El backend valida stock de insumos; 409 con detalle si falta algo.
  Future<Either<Failure, ProductionRunModel>> produce({
    required String subproductId,
    required double quantityProduced,
    String? notes,
    String? idempotencyKey,
  });
}
