import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_item_model.dart';

void main() {
  group('KitchenOrderItemModel.fromJson', () {
    test('parsea ítem completo con modifiers', () {
      final item = KitchenOrderItemModel.fromJson(<String, dynamic>{
        'id': 'item-1',
        'productId': 'prod-1',
        'productName': 'Papas',
        'sizeName': 'Grande',
        'quantity': 3,
        'modifiers': [
          {'modifierId': 'm1', 'name': 'Salsa BBQ', 'priceDelta': 1500},
          {'modifierId': 'm2', 'name': 'Sin sal', 'priceDelta': 0},
        ],
        'notes': 'extra crocantes',
      });

      expect(item.id, 'item-1');
      expect(item.productId, 'prod-1');
      expect(item.productName, 'Papas');
      expect(item.sizeName, 'Grande');
      expect(item.quantity, 3);
      expect(item.modifiers, hasLength(2));
      expect(item.modifiers[0].name, 'Salsa BBQ');
      expect(item.notes, 'extra crocantes');
    });

    test('productName ausente cae a "—" y modifiers ausentes a lista vacía', () {
      final item = KitchenOrderItemModel.fromJson(<String, dynamic>{
        'id': 'item-2',
        'productId': 'prod-2',
        'quantity': 1,
      });

      expect(item.productName, '—');
      expect(item.sizeName, isNull);
      expect(item.modifiers, isEmpty);
      expect(item.notes, isNull);
    });
  });

  group('AppliedModifierModel.fromJson', () {
    test('coerciona priceDelta entero del JSON a double', () {
      final mod = AppliedModifierModel.fromJson(<String, dynamic>{
        'modifierId': 'm1',
        'name': 'Extra queso',
        'priceDelta': 2000, // backend manda int cuando no hay decimales
      });

      expect(mod.priceDelta, isA<double>());
      expect(mod.priceDelta, 2000.0);
    });
  });
}
