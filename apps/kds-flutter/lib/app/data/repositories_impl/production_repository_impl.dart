import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/data/sources/production_api_provider.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';
import 'package:kds/app/domain/repositories/production_repository.dart';

class ProductionRepositoryImpl implements ProductionRepository {
  ProductionRepositoryImpl({required DioHttpProvider http})
      : _provider = ProductionApiProvider(http: http);

  final ProductionApiProvider _provider;

  @override
  Future<Either<Failure, List<ProducibleSubproductModel>>> listProducibles() =>
      _provider.listProducibles();

  @override
  Future<Either<Failure, ProductionRunModel>> produce({
    required String subproductId,
    required double quantityProduced,
    String? notes,
    String? idempotencyKey,
  }) =>
      _provider.produce(
        subproductId: subproductId,
        quantityProduced: quantityProduced,
        notes: notes,
        idempotencyKey: idempotencyKey,
      );
}
