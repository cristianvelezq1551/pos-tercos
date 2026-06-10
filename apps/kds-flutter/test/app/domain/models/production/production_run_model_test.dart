import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/domain/models/production/production_run_model.dart';

void main() {
  group('ProductionRunModel.fromJson', () {
    test('parsea tanda completa con consumos de ambos tipos', () {
      final run = ProductionRunModel.fromJson(<String, dynamic>{
        'runId': 'run-1',
        'subproductId': 'sub-1',
        'subproductName': 'Pollo Nashville cocido',
        'quantityProduced': 950,
        'unit': 'gramos',
        'consumed': [
          {
            'entityType': 'INGREDIENT',
            'entityId': 'ing-1',
            'name': 'Pollo crudo',
            'quantityConsumed': 1000,
            'unit': 'gramos',
          },
          {
            'entityType': 'SUBPRODUCT',
            'entityId': 'sub-2',
            'name': 'Marinada',
            'quantityConsumed': 150.5,
            'unit': 'ml',
          },
        ],
        'createdAt': '2026-06-09T10:00:00.000Z',
      });

      expect(run.runId, 'run-1');
      expect(run.subproductId, 'sub-1');
      expect(run.quantityProduced, 950.0);
      expect(run.unit, 'gramos');
      expect(run.consumed, hasLength(2));
      expect(run.consumed[0].entityType, ConsumedEntityType.ingredient);
      expect(run.consumed[0].quantityConsumed, 1000.0);
      expect(run.consumed[1].entityType, ConsumedEntityType.subproduct);
      expect(run.consumed[1].quantityConsumed, 150.5);
      expect(run.createdAt, DateTime.parse('2026-06-09T10:00:00.000Z'));
    });

    test('consumed ausente cae a lista vacía y strings opcionales a default', () {
      final run = ProductionRunModel.fromJson(<String, dynamic>{
        'runId': 'run-2',
        'subproductId': 'sub-1',
        'createdAt': '2026-06-09T10:00:00.000Z',
      });

      expect(run.consumed, isEmpty);
      expect(run.subproductName, '');
      expect(run.quantityProduced, 0.0);
      expect(run.unit, '');
    });
  });

  group('ConsumedItemModel.fromJson', () {
    test('entityType desconocido o ausente cae a ingredient', () {
      final fromUnknown = ConsumedItemModel.fromJson(<String, dynamic>{
        'entityType': 'PRODUCT',
        'entityId': 'e1',
      });
      final fromMissing = ConsumedItemModel.fromJson(<String, dynamic>{
        'entityId': 'e2',
      });

      expect(fromUnknown.entityType, ConsumedEntityType.ingredient);
      expect(fromMissing.entityType, ConsumedEntityType.ingredient);
      expect(fromMissing.name, '');
      expect(fromMissing.quantityConsumed, 0.0);
    });
  });
}
