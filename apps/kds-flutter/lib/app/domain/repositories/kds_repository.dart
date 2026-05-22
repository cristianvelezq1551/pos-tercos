import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

abstract class KdsRepository {
  Future<Either<Failure, List<KitchenOrderModel>>> getOrders();
  Future<Either<Failure, KitchenOrderModel>> startOrder(String id);
  Future<Either<Failure, KitchenOrderModel>> readyOrder(String id);
}
