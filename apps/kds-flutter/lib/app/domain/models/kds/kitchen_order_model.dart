import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_item_model.dart';

part 'kitchen_order_model.freezed.dart';
part 'kitchen_order_model.g.dart';

/// Estados que el KDS muestra y gestiona.
enum KitchenStatus { pagado, enPreparacion, listoDespacho }

extension KitchenStatusX on KitchenStatus {
  String get label => switch (this) {
        KitchenStatus.pagado => 'PAGADO',
        KitchenStatus.enPreparacion => 'EN_PREPARACION',
        KitchenStatus.listoDespacho => 'LISTO_DESPACHO',
      };

  static KitchenStatus fromString(String s) => switch (s) {
        'PAGADO' => KitchenStatus.pagado,
        'EN_PREPARACION' => KitchenStatus.enPreparacion,
        'LISTO_DESPACHO' => KitchenStatus.listoDespacho,
        _ => KitchenStatus.pagado,
      };
}

/// Tipo de orden — COUNTER (mostrador) o WEB_PICKUP (pedido web).
enum OrderType { counter, webPickup }

extension OrderTypeX on OrderType {
  String get label => switch (this) {
        OrderType.counter => 'Mostrador',
        OrderType.webPickup => 'Web / Pickup',
      };

  static OrderType fromString(String s) => switch (s) {
        'WEB_PICKUP' => OrderType.webPickup,
        _ => OrderType.counter,
      };
}

/// Modelo principal del KDS. Proyección de Sale que contiene solo los
/// campos que la cocina necesita.
@freezed
abstract class KitchenOrderModel with _$KitchenOrderModel {
  const factory KitchenOrderModel({
    required String id,
    required int receiptNumber,
    required OrderType type,
    required KitchenStatus status,
    String? customerName,
    String? notes,
    DateTime? paidAt,
    required DateTime createdAt,
    @Default([]) List<KitchenOrderItemModel> items,
  }) = _KitchenOrderModel;

  factory KitchenOrderModel.fromJson(Map<String, dynamic> json) =>
      KitchenOrderModel(
        id: json['id'] as String,
        receiptNumber: json['receiptNumber'] as int,
        type: OrderTypeX.fromString(json['type'] as String? ?? 'COUNTER'),
        status: KitchenStatusX.fromString(json['status'] as String? ?? 'PAGADO'),
        customerName: json['customerName'] as String?,
        notes: json['notes'] as String?,
        paidAt: json['paidAt'] != null
            ? DateTime.tryParse(json['paidAt'] as String)
            : null,
        createdAt: DateTime.parse(json['createdAt'] as String),
        items: (json['items'] as List<dynamic>?)
                ?.map((e) =>
                    KitchenOrderItemModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}
