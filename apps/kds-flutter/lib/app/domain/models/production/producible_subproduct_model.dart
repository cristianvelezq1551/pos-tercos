import 'package:freezed_annotation/freezed_annotation.dart';

part 'producible_subproduct_model.freezed.dart';
part 'producible_subproduct_model.g.dart';

/// Subproducto producible — junta info del subproducto (id, name, unit, yield,
/// thresholdMin, isActive) con su stock actual del inventario. Lo arma el
/// repositorio fusionando `GET /subproducts` + `GET /inventory/stock`.
@freezed
abstract class ProducibleSubproductModel with _$ProducibleSubproductModel {
  const factory ProducibleSubproductModel({
    required String id,
    required String name,
    /// Unidad del subproducto (piezas, gramos, etc).
    required String unit,
    /// Cuántas unidades produce una corrida de la receta.
    required double yield,
    /// Umbral mínimo de stock; 0 = sin umbral.
    required double thresholdMin,
    /// Stock actual en la misma unidad que `unit`.
    required double currentStock,
    required bool isActive,
  }) = _ProducibleSubproductModel;

  /// Helper UI: stock por debajo del umbral configurado.
  factory ProducibleSubproductModel.fromJson(Map<String, dynamic> json) =>
      ProducibleSubproductModel(
        id: json['id'] as String,
        name: json['name'] as String,
        unit: json['unit'] as String? ?? 'unidad',
        yield: (json['yield'] as num? ?? 1).toDouble(),
        thresholdMin: (json['thresholdMin'] as num? ?? 0).toDouble(),
        currentStock: (json['currentStock'] as num? ?? 0).toDouble(),
        isActive: json['isActive'] as bool? ?? true,
      );
}

extension ProducibleSubproductX on ProducibleSubproductModel {
  bool get isLowStock => isActive && currentStock < thresholdMin;
}
