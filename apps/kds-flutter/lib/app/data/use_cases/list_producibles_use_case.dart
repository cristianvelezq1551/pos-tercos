import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';
import 'package:kds/app/domain/repositories/production_repository.dart';

class ListProduciblesUseCase {
  ListProduciblesUseCase({required ProductionRepository repository})
      : _repository = repository;

  final ProductionRepository _repository;

  Future<Either<Failure, List<ProducibleSubproductModel>>> call() =>
      _repository.listProducibles();
}
