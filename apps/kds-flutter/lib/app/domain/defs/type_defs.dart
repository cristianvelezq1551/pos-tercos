import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';

typedef Json = Map<String, dynamic>;
typedef FutureEither<L, R> = Future<Either<L, R>>;
typedef FutureFailureOr<R> = FutureEither<Failure, R>;
