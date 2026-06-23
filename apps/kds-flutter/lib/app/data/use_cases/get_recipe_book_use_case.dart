import 'package:kds/app/core/network/either.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';
import 'package:kds/app/domain/repositories/recipe_book_repository.dart';

class GetRecipeBookUseCase {
  GetRecipeBookUseCase({required RecipeBookRepository repository})
      : _repository = repository;

  final RecipeBookRepository _repository;

  Future<Either<Failure, RecipeBookModel>> call() => _repository.getRecipeBook();
}
