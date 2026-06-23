import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';

/// Cliente HTTP para producción. Usa el endpoint único accesible al cocinero
/// `GET /subproducts/production-status` (subproductos activos + stock + umbral)
/// y `POST /subproducts/:id/produce` para registrar una tanda.
class ProductionApiProvider {
  ProductionApiProvider({required DioHttpProvider http}) : _http = http;

  final DioHttpProvider _http;

  Future<Either<Failure, List<ProducibleSubproductModel>>> listProducibles() async {
    final res = await _http.get<List<ProducibleSubproductModel>>(
      Endpoints.productionStatus,
      converter: (json) => (json as List<dynamic>)
          .map((e) =>
              ProducibleSubproductModel.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    if (res is Left<Failure, List<ProducibleSubproductModel>>) {
      return Left(res.value);
    }
    final list =
        (res as Right<Failure, List<ProducibleSubproductModel>>).value;
    // Orden: low-stock primero, después alfabético.
    final sorted = [...list]..sort((a, b) {
      if (a.isLowStock != b.isLowStock) return a.isLowStock ? -1 : 1;
      return a.name.compareTo(b.name);
    });
    return Right(sorted);
  }

  Future<Either<Failure, ProductionRunModel>> produce({
    required String subproductId,
    required double quantityProduced,
    String? notes,
    String? idempotencyKey,
  }) {
    return _http.post<ProductionRunModel>(
      Endpoints.produceSubproduct(subproductId),
      data: {
        'quantityProduced': quantityProduced,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        'idempotencyKey': ?idempotencyKey,
      },
      converter: (json) =>
          ProductionRunModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
