import 'package:freezed_annotation/freezed_annotation.dart';

part 'kitchen_order_item_model.freezed.dart';
part 'kitchen_order_item_model.g.dart';

/// Modificador aplicado a un ítem (snapshot congelado al momento de la venta).
@freezed
abstract class AppliedModifierModel with _$AppliedModifierModel {
  const factory AppliedModifierModel({
    required String modifierId,
    required String name,
    required double priceDelta,
  }) = _AppliedModifierModel;

  factory AppliedModifierModel.fromJson(Map<String, dynamic> json) =>
      AppliedModifierModel(
        modifierId: json['modifierId'] as String,
        name: json['name'] as String,
        priceDelta: (json['priceDelta'] as num).toDouble(),
      );
}

/// Ítem de una orden de cocina. El KDS solo necesita productName,
/// sizeName, quantity, modifiers y notes.
@freezed
abstract class KitchenOrderItemModel with _$KitchenOrderItemModel {
  const factory KitchenOrderItemModel({
    required String id,
    required String productId,
    required String productName,
    String? sizeName,
    required int quantity,
    @Default([]) List<AppliedModifierModel> modifiers,
    String? notes,
  }) = _KitchenOrderItemModel;

  factory KitchenOrderItemModel.fromJson(Map<String, dynamic> json) =>
      KitchenOrderItemModel(
        id: json['id'] as String,
        productId: json['productId'] as String,
        productName: json['productName'] as String? ?? '—',
        sizeName: json['sizeName'] as String?,
        quantity: json['quantity'] as int,
        modifiers: (json['modifiers'] as List<dynamic>?)
                ?.map((e) =>
                    AppliedModifierModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        notes: json['notes'] as String?,
      );
}
