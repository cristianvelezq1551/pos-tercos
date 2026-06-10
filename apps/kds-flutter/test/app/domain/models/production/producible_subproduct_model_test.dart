import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/domain/models/production/producible_subproduct_model.dart';

void main() {
  group('ProducibleSubproductModel.fromJson', () {
    test('parsea payload completo (subproducto + stock mergeado)', () {
      final sub = ProducibleSubproductModel.fromJson(<String, dynamic>{
        'id': 'sub-1',
        'name': 'Pollo Nashville cocido',
        'unit': 'gramos',
        'yield': 950.5,
        'thresholdMin': 500,
        'currentStock': 1200,
        'isActive': true,
      });

      expect(sub.id, 'sub-1');
      expect(sub.name, 'Pollo Nashville cocido');
      expect(sub.unit, 'gramos');
      expect(sub.yield, 950.5);
      expect(sub.thresholdMin, 500.0);
      expect(sub.currentStock, 1200.0);
      expect(sub.isActive, isTrue);
    });

    test('aplica defaults cuando faltan campos opcionales', () {
      final sub = ProducibleSubproductModel.fromJson(<String, dynamic>{
        'id': 'sub-2',
        'name': 'Salsa de la casa',
      });

      expect(sub.unit, 'unidad');
      expect(sub.yield, 1.0);
      expect(sub.thresholdMin, 0.0);
      expect(sub.currentStock, 0.0);
      expect(sub.isActive, isTrue);
    });
  });

  group('isLowStock', () {
    ProducibleSubproductModel make({
      required double stock,
      required double threshold,
      bool active = true,
    }) =>
        ProducibleSubproductModel(
          id: 'x',
          name: 'x',
          unit: 'unidad',
          yield: 1,
          thresholdMin: threshold,
          currentStock: stock,
          isActive: active,
        );

    test('true cuando está activo y por debajo del umbral', () {
      expect(make(stock: 4, threshold: 5).isLowStock, isTrue);
    });

    test('false cuando está en el umbral, sin umbral (0) o inactivo', () {
      expect(make(stock: 5, threshold: 5).isLowStock, isFalse);
      expect(make(stock: 0, threshold: 0).isLowStock, isFalse,
          reason: 'thresholdMin 0 = sin umbral, nunca low');
      expect(make(stock: 1, threshold: 5, active: false).isLowStock, isFalse);
    });
  });
}
