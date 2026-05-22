// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'kitchen_order_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_KitchenOrderModel _$KitchenOrderModelFromJson(Map<String, dynamic> json) =>
    _KitchenOrderModel(
      id: json['id'] as String,
      receiptNumber: (json['receiptNumber'] as num).toInt(),
      type: $enumDecode(_$OrderTypeEnumMap, json['type']),
      status: $enumDecode(_$KitchenStatusEnumMap, json['status']),
      customerName: json['customerName'] as String?,
      notes: json['notes'] as String?,
      paidAt: json['paidAt'] == null
          ? null
          : DateTime.parse(json['paidAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      items:
          (json['items'] as List<dynamic>?)
              ?.map(
                (e) =>
                    KitchenOrderItemModel.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
    );

Map<String, dynamic> _$KitchenOrderModelToJson(_KitchenOrderModel instance) =>
    <String, dynamic>{
      'id': instance.id,
      'receiptNumber': instance.receiptNumber,
      'type': _$OrderTypeEnumMap[instance.type]!,
      'status': _$KitchenStatusEnumMap[instance.status]!,
      'customerName': instance.customerName,
      'notes': instance.notes,
      'paidAt': instance.paidAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'items': instance.items,
    };

const _$OrderTypeEnumMap = {
  OrderType.counter: 'counter',
  OrderType.webPickup: 'webPickup',
};

const _$KitchenStatusEnumMap = {
  KitchenStatus.pagado: 'pagado',
  KitchenStatus.enPreparacion: 'enPreparacion',
  KitchenStatus.listoDespacho: 'listoDespacho',
};
