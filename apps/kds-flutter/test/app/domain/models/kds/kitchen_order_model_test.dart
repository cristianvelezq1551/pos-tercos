import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/domain/models/kds/kitchen_order_model.dart';

void main() {
  group('KitchenOrderModel.fromJson', () {
    test('parsea payload completo del backend (WEB_PICKUP pagado)', () {
      final json = <String, dynamic>{
        'id': 'sale-123',
        'receiptNumber': 87,
        'turnNumber': 12,
        'type': 'WEB_PICKUP',
        'status': 'EN_PREPARACION',
        'customerName': 'Laura',
        'notes': 'sin cebolla',
        'paidAt': '2026-06-09T18:30:00.000Z',
        'createdAt': '2026-06-09T18:25:00.000Z',
        'items': [
          {
            'id': 'item-1',
            'productId': 'prod-1',
            'productName': 'Hamburguesa Nashville',
            'sizeName': 'Doble',
            'quantity': 2,
            'modifiers': [
              {'modifierId': 'mod-1', 'name': 'Extra queso', 'priceDelta': 2000},
            ],
            'notes': 'bien cocida',
          },
        ],
      };

      final order = KitchenOrderModel.fromJson(json);

      expect(order.id, 'sale-123');
      expect(order.receiptNumber, 87);
      expect(order.turnNumber, 12);
      expect(order.type, OrderType.webPickup);
      expect(order.status, KitchenStatus.enPreparacion);
      expect(order.customerName, 'Laura');
      expect(order.notes, 'sin cebolla');
      expect(order.paidAt, DateTime.parse('2026-06-09T18:30:00.000Z'));
      expect(order.createdAt, DateTime.parse('2026-06-09T18:25:00.000Z'));
      expect(order.items, hasLength(1));
      expect(order.items.first.productName, 'Hamburguesa Nashville');
      expect(order.items.first.modifiers.first.priceDelta, 2000.0);
    });

    test('tolera turnNumber null, opcionales ausentes e items ausentes', () {
      // Pedido web recién creado: aún sin pagar → sin turno ni paidAt.
      final json = <String, dynamic>{
        'id': 'sale-456',
        'receiptNumber': 88,
        'createdAt': '2026-06-09T19:00:00.000Z',
      };

      final order = KitchenOrderModel.fromJson(json);

      expect(order.turnNumber, isNull);
      expect(order.type, OrderType.counter, reason: 'default COUNTER');
      expect(order.status, KitchenStatus.pagado, reason: 'default PAGADO');
      expect(order.customerName, isNull);
      expect(order.notes, isNull);
      expect(order.paidAt, isNull);
      expect(order.items, isEmpty);
    });

    test('status desconocido cae a pagado y type desconocido a counter', () {
      final order = KitchenOrderModel.fromJson(<String, dynamic>{
        'id': 'sale-789',
        'receiptNumber': 1,
        'type': 'WEB_DELIVERY',
        'status': 'EN_RUTA',
        'createdAt': '2026-06-09T19:00:00.000Z',
        'items': <dynamic>[],
      });

      expect(order.status, KitchenStatus.pagado);
      expect(order.type, OrderType.counter);
    });

    test('paidAt con formato inválido queda null (tryParse)', () {
      final order = KitchenOrderModel.fromJson(<String, dynamic>{
        'id': 'sale-x',
        'receiptNumber': 2,
        'paidAt': 'no-es-fecha',
        'createdAt': '2026-06-09T19:00:00.000Z',
      });

      expect(order.paidAt, isNull);
    });
  });

  group('KitchenStatusX / OrderTypeX', () {
    test('fromString y label son inversos para los 3 estados', () {
      for (final status in KitchenStatus.values) {
        expect(KitchenStatusX.fromString(status.label), status);
      }
    });

    test('labels de tipo de orden en español', () {
      expect(OrderType.counter.label, 'Mostrador');
      expect(OrderType.webPickup.label, 'Web / Pickup');
      expect(OrderTypeX.fromString('WEB_PICKUP'), OrderType.webPickup);
      expect(OrderTypeX.fromString('COUNTER'), OrderType.counter);
    });
  });
}
