import 'package:kds/app/core/constants/endpoints.dart';
import 'package:kds/app/core/network/dio_http_provider.dart';
import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

class KdsApiProvider {
  KdsApiProvider({required DioHttpProvider http}) : _http = http;

  final DioHttpProvider _http;

  Future<Either<Failure, List<KitchenOrderModel>>> getOrders() {
    return _http.get<List<KitchenOrderModel>>(
      Endpoints.kdsOrders,
      converter: (json) {
        final list = json as List<dynamic>;
        return list
            .map((e) => KitchenOrderModel.fromJson(e as Map<String, dynamic>))
            .toList();
      },
    );
  }

  Future<Either<Failure, KitchenOrderModel>> startOrder(String id) {
    return _http.post<KitchenOrderModel>(
      Endpoints.kdsOrderStart(id),
      converter: (json) =>
          KitchenOrderModel.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<Either<Failure, KitchenOrderModel>> readyOrder(String id) {
    return _http.post<KitchenOrderModel>(
      Endpoints.kdsOrderReady(id),
      converter: (json) =>
          KitchenOrderModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
