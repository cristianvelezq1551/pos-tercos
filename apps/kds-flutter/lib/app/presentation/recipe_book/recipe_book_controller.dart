import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kds/app/core/di/providers.dart';
import 'package:kds/app/core/network/failure.dart';
import 'package:kds/app/domain/models/recipe_book/recipe_book_models.dart';

/// Estado inmutable de la biblia de productos.
sealed class RecipeBookState {
  const RecipeBookState();
}

final class RecipeBookLoading extends RecipeBookState {
  const RecipeBookLoading();
}

final class RecipeBookData extends RecipeBookState {
  const RecipeBookData(this.book);
  final RecipeBookModel book;
}

final class RecipeBookFatal extends RecipeBookState {
  const RecipeBookFatal(this.failure);
  final FailureViewData failure;
}

final class RecipeBookSessionExpired extends RecipeBookState {
  const RecipeBookSessionExpired();
}

class RecipeBookController extends Notifier<RecipeBookState> {
  bool _sessionEnded = false;

  @override
  RecipeBookState build() {
    _load();
    return const RecipeBookLoading();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    if (_sessionEnded) return;
    state = const RecipeBookLoading();
    final useCase = ref.read(getRecipeBookUseCaseProvider);
    final result = await useCase();
    if (_sessionEnded) return;

    result.fold(
      (failure) {
        if (failure is AuthFailure) {
          _sessionEnded = true;
          ref.read(dioHttpProvider).clearSession();
          state = const RecipeBookSessionExpired();
          return;
        }
        state = RecipeBookFatal(mapFailureToView(failure));
      },
      (book) => state = RecipeBookData(book),
    );
  }
}

final recipeBookControllerProvider =
    NotifierProvider<RecipeBookController, RecipeBookState>(
  RecipeBookController.new,
);
