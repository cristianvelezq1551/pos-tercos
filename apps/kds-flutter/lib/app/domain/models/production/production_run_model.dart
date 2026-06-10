import 'package:freezed_annotation/freezed_annotation.dart';

part 'production_run_model.freezed.dart';
part 'production_run_model.g.dart';

/// Tipo de la entidad consumida en una tanda de producción.
enum ConsumedEntityType { ingredient, subproduct }

extension ConsumedEntityTypeX on ConsumedEntityType {
  static ConsumedEntityType fromString(String s) => switch (s) {
        'SUBPRODUCT' => ConsumedEntityType.subproduct,
        _ => ConsumedEntityType.ingredient,
      };
}

/// Item consumido por una tanda de producción.
@freezed
abstract class ConsumedItemModel with _$ConsumedItemModel {
  const factory ConsumedItemModel({
    required ConsumedEntityType entityType,
    required String entityId,
    required String name,
    required double quantityConsumed,
    required String unit,
  }) = _ConsumedItemModel;

  factory ConsumedItemModel.fromJson(Map<String, dynamic> json) =>
      ConsumedItemModel(
        entityType: ConsumedEntityTypeX.fromString(
          json['entityType'] as String? ?? 'INGREDIENT',
        ),
        entityId: json['entityId'] as String,
        name: json['name'] as String? ?? '',
        quantityConsumed: (json['quantityConsumed'] as num? ?? 0).toDouble(),
        unit: json['unit'] as String? ?? '',
      );
}

/// Respuesta del backend al registrar una tanda de producción.
@freezed
abstract class ProductionRunModel with _$ProductionRunModel {
  const factory ProductionRunModel({
    required String runId,
    required String subproductId,
    required String subproductName,
    required double quantityProduced,
    required String unit,
    @Default([]) List<ConsumedItemModel> consumed,
    required DateTime createdAt,
  }) = _ProductionRunModel;

  factory ProductionRunModel.fromJson(Map<String, dynamic> json) =>
      ProductionRunModel(
        runId: json['runId'] as String,
        subproductId: json['subproductId'] as String,
        subproductName: json['subproductName'] as String? ?? '',
        quantityProduced: (json['quantityProduced'] as num? ?? 0).toDouble(),
        unit: json['unit'] as String? ?? '',
        consumed: (json['consumed'] as List<dynamic>?)
                ?.map((e) =>
                    ConsumedItemModel.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
