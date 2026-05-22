import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/data/sources/kds_api_provider.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';
import 'package:kds/app/domain/repositories/kds_repository.dart';

class KdsRepositoryImpl implements KdsRepository {
  KdsRepositoryImpl({required DioHttpProvider http})
      : _provider = KdsApiProvider(http: http);

  final KdsApiProvider _provider;

  @override
  Future<Either<Failure, List<KitchenOrderModel>>> getOrders() =>
      _provider.getOrders();

  @override
  Future<Either<Failure, KitchenOrderModel>> startOrder(String id) =>
      _provider.startOrder(id);

  @override
  Future<Either<Failure, KitchenOrderModel>> readyOrder(String id) =>
      _provider.readyOrder(id);
}
