import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';
import 'package:kds/app/domain/repositories/production_repository.dart';

class ProduceSubproductUseCase {
  ProduceSubproductUseCase({required ProductionRepository repository})
      : _repository = repository;

  final ProductionRepository _repository;

  Future<Either<Failure, ProductionRunModel>> call({
    required String subproductId,
    required double quantityProduced,
    String? notes,
    String? idempotencyKey,
  }) =>
      _repository.produce(
        subproductId: subproductId,
        quantityProduced: quantityProduced,
        notes: notes,
        idempotencyKey: idempotencyKey,
      );
}
