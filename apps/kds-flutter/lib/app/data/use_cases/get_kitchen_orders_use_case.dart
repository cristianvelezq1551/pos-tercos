import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/domain/repositories/kds_repository.dart';

class GetKitchenOrdersUseCase {
  GetKitchenOrdersUseCase({required KdsRepository repository})
      : _repository = repository;

  final KdsRepository _repository;

  Future<Either<Failure, List<KitchenOrderModel>>> call() =>
      _repository.getOrders();
}
