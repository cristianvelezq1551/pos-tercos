import 'package:flutter_test/flutter_test.dart';
import 'package:kds/app/core/network/either.dart';

void main() {
  group('Either', () {
    test('Left: isLeft y fold ejecuta solo onLeft', () {
      const Either<String, int> either = Left('error');

      expect(either.isLeft, isTrue);
      expect(either.isRight, isFalse);
      expect(
        either.fold((l) => 'left:$l', (r) => 'right:$r'),
        'left:error',
      );
    });

    test('Right: isRight y fold ejecuta solo onRight', () {
      const Either<String, int> either = Right(42);

      expect(either.isRight, isTrue);
      expect(either.isLeft, isFalse);
      expect(
        either.fold((l) => 'left:$l', (r) => 'right:$r'),
        'right:42',
      );
    });
  });
}
