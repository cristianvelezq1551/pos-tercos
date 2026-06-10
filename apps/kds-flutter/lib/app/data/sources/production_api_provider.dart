import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';

/// Cliente HTTP para producción. Combina dos endpoints:
///  - GET /subproducts            → lista de subproductos
///  - GET /inventory/stock        → stock por stockable (incluye SUBPRODUCT)
/// Lo mergea en memoria para devolver `ProducibleSubproductModel[]`.
class ProductionApiProvider {
  ProductionApiProvider({required DioHttpProvider http}) : _http = http;

  final DioHttpProvider _http;

  Future<Either<Failure, List<ProducibleSubproductModel>>> listProducibles() async {
    // 1. Subproductos activos.
    final subsRes = await _http.get<List<Map<String, dynamic>>>(
      Endpoints.subproducts,
      converter: (json) => (json as List<dynamic>)
          .map((e) => e as Map<String, dynamic>)
          .toList(),
    );
    if (subsRes is Left<Failure, List<Map<String, dynamic>>>) {
      return Left(subsRes.value);
    }
    final subs = (subsRes as Right<Failure, List<Map<String, dynamic>>>).value;

    // 2. Stock de todos los stockables. Filtramos SUBPRODUCT y mergeamos.
    final stockRes = await _http.get<Map<String, double>>(
      Endpoints.inventoryStock,
      converter: (json) {
        final list = json as List<dynamic>;
        final map = <String, double>{};
        for (final s in list) {
          final m = s as Map<String, dynamic>;
          if (m['type'] == 'SUBPRODUCT') {
            map[m['id'] as String] = (m['currentStock'] as num? ?? 0).toDouble();
          }
        }
        return map;
      },
    );
    // Si stock falla (poco probable), mostramos subproductos con stock=0 en
    // vez de bloquear toda la pantalla.
    final stockMap = stockRes is Right<Failure, Map<String, double>>
        ? stockRes.value
        : <String, double>{};

    final result = subs.where((s) => s['isActive'] == true).map((m) {
      final id = m['id'] as String;
      return ProducibleSubproductModel.fromJson({
        ...m,
        'currentStock': stockMap[id] ?? 0,
      });
    }).toList();
    // Orden: low-stock primero, después alfabético.
    result.sort((a, b) {
      if (a.isLowStock != b.isLowStock) return a.isLowStock ? -1 : 1;
      return a.name.compareTo(b.name);
    });
    return Right(result);
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
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
      converter: (json) =>
          ProductionRunModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
