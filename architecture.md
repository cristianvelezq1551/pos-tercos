# 📐 Arquitectura del Proyecto — CrediClub Mobile App

> **Documento técnico de referencia** para IA y desarrolladores.
> Última actualización: 26 de febrero de 2026.

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura de Carpetas](#3-estructura-de-carpetas)
4. [Capas de la Arquitectura (Clean Architecture)](#4-capas-de-la-arquitectura)
   - 4.1 [Core](#41-core)
   - 4.2 [Domain](#42-domain)
   - 4.3 [Data](#43-data)
   - 4.4 [Presentation](#44-presentation)
5. [Flujo Completo de un Feature (Caso: Cards)](#5-flujo-completo-de-un-feature-caso-cards)
6. [Sesión 1: Implementación de Servicios / APIs](#6-sesión-1-implementación-de-servicios--apis)
7. [Sesión 2: Manejo de Vistas, Widgets, Colores, Tipografía y Spacing](#7-sesión-2-manejo-de-vistas-widgets-colores-tipografía-y-spacing)
8. [Inyección de Dependencias (DI)](#8-inyección-de-dependencias-di)
9. [Navegación (Routing)](#9-navegación-routing)
10. [Convenciones de Nombrado](#10-convenciones-de-nombrado)
11. [Manejo de Errores](#11-manejo-de-errores)
12. [Guía Rápida para Crear un Nuevo Módulo](#12-guía-rápida-para-crear-un-nuevo-módulo)

---

## 1. Visión General

La app sigue una **Clean Architecture** adaptada a Flutter con 4 capas principales:

```
┌─────────────────────────────────────────────┐
│              PRESENTATION                   │
│   (Widgets, Vistas, Controladores, Router)  │
├─────────────────────────────────────────────┤
│                 DOMAIN                      │
│   (Modelos, Repositorios abstractos, Defs)  │
├─────────────────────────────────────────────┤
│                  DATA                       │
│   (UseCases, RepoImpl, Providers/API)       │
├─────────────────────────────────────────────┤
│                  CORE                       │
│   (Network, Theme, DI, Utils, Adaptive)     │
└─────────────────────────────────────────────┘
```

**Regla de dependencia**: Cada capa solo puede depender de capas inferiores. La capa **Domain** es la más pura — no depende de Flutter ni de paquetes externos (salvo `freezed_annotation`).

---

## 2. Stack Tecnológico

| Categoría | Tecnología |
|---|---|
| **Estado** | Riverpod + Riverpod Code Generation (`@riverpod`, `@Riverpod(keepAlive: true)`) |
| **Modelos** | Freezed (`@freezed`) + `json_serializable` (código generado: `.freezed.dart`, `.g.dart`) |
| **HTTP** | Dio con interceptores personalizados (CRC, logging, errores críticos) |
| **Navegación** | GoRouter (`go_router`) |
| **Textos UI** | Firebase Remote Config (100% configurable en remoto) |
| **Responsive** | Sistema adaptativo propio (`AdaptiveScreen`, `AdaptiveFontSize`, `AdaptiveSpacing`) |
| **Seguridad** | RSA para encryption, CRC-HMAC para integridad de requests, Dynatrace APM |
| **CI/CD** | Azure Pipelines, 4 flavors: `dev`, `qa`, `staging`, `production` |
| **Lenguaje** | Dart 3+ (sealed classes, pattern matching, records) |

---

## 3. Estructura de Carpetas

```
lib/
├── main.dart                        # Entry point default
├── main_dev.dart                    # Entry point: development
├── main_qa.dart                     # Entry point: QA
├── main_staging.dart                # Entry point: staging
├── main_production.dart             # Entry point: production
└── app/
    ├── main_with_flavor.dart        # Bootstrap con flavor
    ├── my_app.dart                  # Widget raíz (MaterialApp.router)
    ├── state_app.dart               # Inicialización de sesión/router
    │
    ├── core/                        # ← Utilidades transversales
    │   ├── adaptive_screen/         # Responsive: wpx(), hpx(), dpx(), sp()
    │   ├── config/                  # Flavor (dev/qa/staging/prod)
    │   ├── constants/               # Endpoints, error codes
    │   ├── enum/                    # Enums globales
    │   ├── error/                   # Global error handler
    │   ├── icon/                    # Iconos custom (CrediClub icons)
    │   ├── injects_providers/       # Proveedores DI por servicio
    │   ├── instances/               # Singletons (Dio, Logger, SecureStorage)
    │   ├── l10n/                    # Localización
    │   ├── network/                 # Either, Failure, HttpClient, Interceptors
    │   ├── theme/                   # SemanticColors, ThemeApp, Typography
    │   └── utils/                   # RSA, JSON, Assets, Device info, etc.
    │
    ├── domain/                      # ← Contratos y modelos puros
    │   ├── defs/                    # Type aliases (FutureEither, Json)
    │   ├── models/                  # Modelos Freezed por feature
    │   └── repositories/           # Interfaces abstractas de repositorios
    │
    ├── data/                        # ← Implementación de datos
    │   ├── uses_cases/              # Casos de uso por feature
    │   ├── repositories_impl/       # Implementaciones de repositorios
    │   └── source/                  # Fuentes de datos
    │       ├── api/                 # Providers HTTP por feature
    │       └── providers/           # Providers locales (Firebase, SharedPrefs, Dio, etc.)
    │
    └── presentation/                # ← UI
        ├── global/                  # Compartido entre módulos
        │   ├── controllers/         # Controladores globales (session, router, auth...)
        │   ├── extensions/          # Extensions sobre Widget, String, DateTime, etc.
        │   ├── modules/             # Módulos globales (Loader, OTP, SessionDetector...)
        │   ├── utils/               # RouterUtil, LoaderUtil, ToastUtil, BottomSheetUtil...
        │   ├── validators/          # Validadores de input (password, email, money...)
        │   ├── widgets/             # 42 widgets globales reutilizables
        │   └── global.dart          # ProviderContainer global
        ├── modules/                 # Features de la app
        │   ├── cards/               # Tarjetas (crédito/débito)
        │   ├── home/                # Home + bottom nav
        │   ├── sign_in/             # Login
        │   ├── transfers/           # Transferencias
        │   ├── ... (27 módulos)
        └── router/                  # GoRouter config + routes
            ├── go_router_provider.dart
            ├── app_routes/          # Definición de rutas por feature
            ├── routes/              # Rutas adicionales
            └── transitions/         # Animaciones de transición
```

---

## 4. Capas de la Arquitectura

### 4.1 Core

La capa **Core** contiene utilidades transversales que NO pertenecen a ningún feature específico.

#### 4.1.1 Network (`core/network/`)

| Archivo | Responsabilidad |
|---|---|
| `either.dart` | Implementación propia de `Either<L, R>` (Left = error, Right = éxito) |
| `failure.dart` | Sealed class `Failure` con subtipos: `NetworkFailure`, `ApiFailure`, `AuthFailure`, `ValidationFailure`, `BusinessFailure`, `NoDataFailure`, `TimeoutFailure`, `StorageFailure`, `UnknownFailure` |
| `handle_failure.dart` | `mapFailureToView(Failure)` → convierte `Failure` en `FailureViewData` con icono y mensaje para la UI |
| `http_client_repository.dart` | Interfaz abstracta con `get`, `post`, `put`, `delete`, `patch` genéricos |
| `http_result.dart` | Sealed class alternativa `HttpResult<T>` → `HttpSuccess` / `HttpFailure` |
| `success.dart` | Sealed class `Result<T>` → `Success<T>` |

**Interceptores Dio** (se ejecutan en cadena):

| Interceptor | Función |
|---|---|
| `CrcInterceptor` | Genera HMAC-SHA256 CRC para requests/responses (integridad) |
| `CriticalErrorInterceptor` | Detecta 401/404/5xx → fuerza logout automático |
| `LoggerInterceptor` | Log de request/response/error |
| `GlobalErrorInterceptor` | Captura errores no manejados |
| `CallStackInterceptor` | Adjunta stack trace del caller para debugging |

**Patrón `Either` (errores funcionales)**:

```dart
// Definición de tipo alias
typedef FutureEither<L, R> = Future<Either<L, R>>;
typedef Json = Map<String, dynamic>;

// Uso en repositorio abstracto
FutureEither<Failure, CardDetailResponseModel> getCardDetails(String cardNumber);

// Uso en use case (convierte Failure → FailureViewData)
FutureEither<FailureViewData, CardDetailResponseModel> call(String cardNumber) async {
  final result = await _cardsRepository.getCardDetails(cardNumber);
  return result.fold(
    (failure) => Left(FailureViewData(message: RemoteConfigKeys.defaultErrorMessage.text)),
    (data) => Right(data),
  );
}

// Uso en controller
final result = await _getCardDetailsUseCase(cardNumber);
result.fold(
  (failure) => state = state.copyWith(error: failure.message),
  (data) => state = state.copyWith(cardDetail: data),
);
```

#### 4.1.2 Adaptive Screen (`core/adaptive_screen/`)

Sistema de responsive design con base de diseño **402×874 px**.

```dart
// AdaptiveScreen — Escala proporcional
final screen = AdaptiveScreen(context);
screen.wpx(16)   // Ancho proporcional: pixels * (screenWidth / 402)
screen.hpx(24)   // Alto proporcional: pixels * (screenHeight / 874)
screen.dpx(12)   // Diagonal proporcional (para padding/spacing)
screen.sp(14)    // Font size con factor clamped entre 0.8 y 1.2

// AdaptiveSpacing — Escala de padding normalizada
final spacing = AdaptiveSpacing(context);
spacing.sx    //  2px base
spacing.sm    //  4px base
spacing.base  //  8px base
spacing.md    // 12px base
spacing.lg    // 16px base
spacing.xl    // 24px base
spacing.xxl   // 32px base
spacing.xxxl  // 44px base
spacing.safe  // 60px base

// AdaptiveFontSize — Sistema tipográfico
final fonts = AdaptiveFontSize(context);
fonts.system.sm       // 10px base, font: Area
fonts.system.base     // 13px base
fonts.system.lg       // 16px base
fonts.system.xl       // 24px base
fonts.system.xl2      // 32px base
fonts.system.xl2Display // 40px base
fonts.display.lg      // 16px base, font: PP-Fragment-Glare

// Extensions de estilo (encadenable)
fonts.system.base.bold.carbon80
fonts.display.xl2.white
fonts.system.lg.medium.teal
```

#### 4.1.3 Theme (`core/theme/`)

**SemanticColors** — Interfaz abstracta con ~35 tokens de color organizados por componente:

```dart
abstract class SemanticColors {
  // Buttons (Primary, Secondary, Outlined, Ghost) × (Normal, Disabled)
  Color get buttonPrimaryBackground;
  Color get buttonPrimaryForeground;
  Color get buttonPrimaryBorder;
  // ... 12 más botones

  // Navigation (AppBar, BottomNav)
  Color get appBarBackground;
  Color get navigationBarActive;

  // Cards
  Color get cardBackground;
  Color get cardForeground;
  Color get cardBorder;
  Color get cardMuted;

  // Inputs (Default, Error)
  Color get inputDefaultBackground;
  Color get inputErrorBorder;

  // System
  Color get systemBackground;
  Color get systemPrimary;
  Color get systemMuted;

  // Credit
  Color get creditAccent;
}
```

**Implementaciones concretas**: `SemanticLightColor` y `SemanticDarkColor`.

**ThemeApp** — Singleton que construye `ThemeData` para light/dark:

```dart
ThemeApp.lightTheme  // ThemeData con SemanticLightColor
ThemeApp.darkTheme   // ThemeData con SemanticDarkColor
```

**Uso en widgets**:

```dart
// Vía utilidad global (fuera de widget tree)
AppColorUtil().tealDark
AppSemanticColorUtil().cardForeground

// Vía Theme
Theme.of(context).primaryColor
```

#### 4.1.4 Inyección de Providers (`core/injects_providers/`)

Cada servicio externo tiene su carpeta con un `*_inject_provider.dart`:

```
injects_providers/
├── dio/            → DioInjectProvider.dioProvider
├── firebase/       → FirebaseInjectProvider.firebaseAnalyticsProvider
├── segment/        → SegmentInjectProvider.segmentRepositoryProvider
├── singular/       → SingularInjectProvider.singularProvider
├── storage/        → StorageInjectProvider.storageInjectProvider
├── shared_preferences/ → SharedPreferencesInjectProvider
├── local_auth/     → LocalAuthInjectProvider
├── session_manager/ → SessionManagerInjectProvider
├── push_notification/ → PushNotificationInjectProvider
└── ... (15+ providers)
```

---

### 4.2 Domain

La capa más pura. Define **QUÉ** hace el sistema, no **CÓMO**.

#### 4.2.1 Modelos (`domain/models/`)

Todos usan **Freezed** para inmutabilidad + serialización JSON:

```dart
@freezed
abstract class CardCvvResponseModel with _$CardCvvResponseModel {
  const factory CardCvvResponseModel({
    required bool success,
    String? errorCode,
    String? message,
    String? cvv,
  }) = _CardCvvResponseModel;

  factory CardCvvResponseModel.fromJson(Map<String, dynamic> json) =>
      _$CardCvvResponseModelFromJson(json);
}
```

**Estructura de carpeta por modelo**:

```
domain/models/cards/common/card_cvv_response/
├── card_cvv_response_model.dart           # Código fuente
├── card_cvv_response_model.freezed.dart   # Generado por Freezed
└── card_cvv_response_model.g.dart         # Generado por json_serializable
```

**Convenciones de modelos**:

- Sufijo `_model` para modelos de datos
- Sufijo `_response_model` para respuestas de API
- Sufijo `_request_model` para requests de API
- `@JsonKey(name: 'fieldName')` cuando el JSON difiere del Dart
- `@Default(value)` para valores por defecto
- `@JsonSerializable(explicitToJson: true)` cuando hay listas anidadas
- Los enums se definen en el mismo archivo del modelo que los usa

**Ejemplo de modelo con request y response**:

```
domain/models/cards/credit_card/purchase_simulator/
├── purchase_simulator_request/
│   └── purchase_simulator_request_model.dart
└── purchase_simulator_response/
    └── purchase_simulator_response_model.dart
```

#### 4.2.2 Repositorios Abstractos (`domain/repositories/`)

Definen contratos que la capa Data debe implementar:

```dart
abstract class CardsRepository {
  FutureEither<Failure, CardDetailResponseModel> getCardDetails(String cardNumber);
  FutureEither<Failure, CardCvvResponseModel> getCardCvv(String cardNumber, String expirationDate);
  FutureEither<Failure, ToggleCardLockResponseModel> toggleCardLock({required ToggleCardLockRequestModel request});
  FutureEither<Failure, CustomerCardsResponseModel> getCustomerCards();
}
```

**Convenciones**:

- Retornan `FutureEither<Failure, T>` (Failure de domain, no de data)
- Parámetros con `required` named parameters para claridad
- Un repositorio por sub-feature (ej: `cards/common/` vs `cards/credit_card/`)

#### 4.2.3 Definiciones (`domain/defs/`)

```dart
typedef Json = Map<String, dynamic>;
typedef FutureEither<L, R> = Future<Either<L, R>>;
```

---

### 4.3 Data

La capa Data implementa los contratos del Domain y conecta con fuentes externas.

#### 4.3.1 Source — API Providers (`data/source/api/`)

Cada feature tiene una carpeta con:

```
data/source/api/cards/common/
├── cards_provider.dart         # Clase que hace los HTTP calls
└── cards_inject_provider.dart  # Provider de Riverpod para DI
```

**Patrón del Provider HTTP**:

```dart
class CardsProvider {
  const CardsProvider({required DioHttpProvider dioHttpProvider})
    : _dioHttpProvider = dioHttpProvider;

  final DioHttpProvider _dioHttpProvider;

  FutureEither<Failure, CardDetailResponseModel> getCardDetails(String cardNumber) async {
    final queryParams = <String, dynamic>{'CardNumber': cardNumber};
    return await _dioHttpProvider.get(
      constants.Endpoints.cardDetails.endpoint,        // Path del API
      headers: {'api-version': constants.Endpoints.cardDetails.version},  // Versión
      queryParameters: queryParams,
      converter: (json) => CardDetailResponseModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
```

**Inject Provider**:

```dart
class CardsInjectProvider {
  const CardsInjectProvider._();

  static final cardsProvider = Provider(
    (ref) => CardsProvider(dioHttpProvider: ref.read(DioInjectProvider.dioProvider)),
  );
}
```

**DioHttpProvider** (`data/source/providers/dio/dio_http_provider.dart`):

Implementa `HttpClientRepository` — es el adaptador entre Dio y el sistema `Either`:

- Inyecta headers de device automáticamente (`DeviceInfoUtil.getHeaders()`)
- Detecta `success: false` en responses y lo trata como error
- Mapea `DioException` → subtipos de `Failure`:
  - `connectionTimeout/receiveTimeout/sendTimeout` → `TimeoutFailure`
  - `400` → `AuthFailure`
  - `401/403` → `AuthFailure`
  - `404` → `ApiFailure`
  - `422` → `ValidationFailure`
  - `5xx` → `ApiFailure`
  - `999` → `ApiFailure` (política de seguridad)
  - Response con `success: false` → `BusinessFailure`
- Envía eventos a Dynatrace para APM
- Refresca sesión en cada response exitoso

#### 4.3.2 Source — Local Providers (`data/source/providers/`)

```
providers/
├── dio/                    # DioHttpProvider (HTTP adapter)
├── firebase/               # Remote Config keys + provider
├── firebase_analytics/     # Analytics tracking
├── shared_prefs/           # SharedPreferences wrapper
├── storage/                # Secure storage (FlutterSecureStorage)
├── segment/                # Segment analytics
├── singular/               # Singular attribution
├── credolab/               # Credolab behavioral
├── incode/                 # Incode identity
├── local_auth/             # Biometric auth
├── push_notification/      # Push notifications
├── session_manager/        # Session timeout management
└── ... (25+ providers)
```

#### 4.3.3 Repository Implementations (`data/repositories_impl/`)

Implementan las interfaces del Domain, delegando al Provider:

```dart
class CardsRepositoryImpl implements CardsRepository {
  const CardsRepositoryImpl({required CardsProvider cardsProvider})
    : _cardsProvider = cardsProvider;

  final CardsProvider _cardsProvider;

  @override
  FutureEither<Failure, CardDetailResponseModel> getCardDetails(String cardNumber) {
    return _cardsProvider.getCardDetails(cardNumber);
  }
  // ... demás métodos delegados
}
```

**Patrón**: la implementación es un "pass-through" simple. La lógica de negocio está en los Use Cases.

#### 4.3.4 Use Cases (`data/uses_cases/`)

Cada use case es una clase con un método `call()`:

```dart
class GetCardDetailsUseCase {
  const GetCardDetailsUseCase({required CardsRepository cardsRepository})
    : _cardsRepository = cardsRepository;

  final CardsRepository _cardsRepository;

  FutureEither<FailureViewData, CardDetailResponseModel> call(String cardNumber) async {
    final result = await _cardsRepository.getCardDetails(cardNumber);
    return result.fold(
      (failure) => Left(FailureViewData(message: RemoteConfigKeys.defaultErrorMessage.text)),
      (data) => Right(data),
    );
  }
}
```

**Diferencia clave Repo vs UseCase**:

| | Repository | Use Case |
|---|---|---|
| Error type | `Failure` (técnico) | `FailureViewData` (con UI: icono, mensaje) |
| Lógica | Delegación pura al provider | Transformación + lógica de negocio |
| Dependencia | Provider HTTP | Repository (interface) |

**Tipos de Use Cases**:

1. **API Use Cases** — Llaman al repositorio y transforman `Failure` → `FailureViewData`
2. **Local Use Cases** — Interactúan con SharedPreferences (ej: `HasCreditCardTooltipShownUseCase`)
3. **Compuestos** — Orquestan múltiples use cases (ej: `CompleteSignInUseCase`)

**Registro de Use Cases** (`data/uses_cases/uses_cases.dart`):

Clase `UsesCases` con ~80+ `static final Provider<T>` fields:

```dart
class UsesCases {
  const UsesCases._();

  static final getCardDetailsUseCase = Provider(
    (ref) => GetCardDetailsUseCase(
      cardsRepository: ref.read(InjectRepository.cardsRepository),
    ),
  );

  static final getCustomerCardsUseCase = Provider(
    (ref) => GetCustomerCardsUseCase(
      cardsRepository: ref.read(InjectRepository.cardsRepository),
    ),
  );
  // ... 80+ use cases
}
```

#### 4.3.5 Endpoints (`core/constants/endpoints.dart`)

```dart
abstract class Endpoints {
  static const Endpoint cardDetails = Endpoint(
    endpoint: '/platform/cards/card-detail',
    version: 1.0,
  );
  static const Endpoint cardCvv = Endpoint(
    endpoint: '/platform/cards/card-cvv',
    version: 1.0,
  );
  // ~200+ endpoints organizados por sección:
  // PLATFORM-AUTH, PLATFORM-SESSION, PLATFORM-CUSTOMER,
  // BANKING, INVESTMENTS, CARDS, LOANS, etc.
}
```

---

### 4.4 Presentation

#### 4.4.1 Estructura de un Módulo (`presentation/modules/{feature}/`)

Cada feature sigue esta estructura interna:

```
modules/cards/credit_card/home/
├── controller/
│   ├── home_credit_card_controller.dart      # Riverpod controller (@riverpod)
│   └── home_credit_card_state.dart           # Estado Freezed
├── view/
│   ├── credit_card_home_view.dart            # Vista principal (ConsumerWidget)
│   └── credit_card_home_error_view.dart      # Vista de error
└── widgets/                                  # Widgets específicos del feature
    ├── credit_card_header_w.dart
    ├── credit_card_sub_header_w.dart
    ├── credit_card_body_w.dart
    ├── credit_card_next_pay_w.dart
    ├── credit_card_calendar_payment_card_w.dart
    ├── credit_card_details_bottom_sheet.dart
    ├── credit_card_home_shimmer.dart
    ├── digital_card_btn_w.dart
    ├── dot_w.dart
    ├── sequential_animated_text_w.dart
    └── animated/                              # Sub-carpeta para widgets animados
        ├── animated_button.dart
        └── animated_detail_field.dart
```

#### 4.4.2 Controladores (Riverpod Notifiers)

Existen **dos convenciones** de naming para controllers:

| Tipo | Sufijo archivo | Sufijo clase | Anotación | keepAlive |
|---|---|---|---|---|
| **Global Controller** (compartido) | `_gc.dart` | `GC` | `@Riverpod(keepAlive: true)` | Sí |
| **Feature Controller** (por pantalla) | `_controller.dart` | `Controller` | `@riverpod` (lowercase) | No (auto-dispose) |

**Feature Controller** (ejemplo real: `home_credit_card_controller.dart`):

```dart
// home_credit_card_controller.dart
part 'home_credit_card_controller.g.dart';

@riverpod  // ← lowercase = auto-dispose cuando la vista se desmonta
class HomeCreditCardController extends _$HomeCreditCardController {
  @override
  HomeCreditCardState build() {
    Future.microtask(() => initializeHome());
    return HomeCreditCardState.initialState;
  }

  Future<void> initializeHome() async {
    state = state.copyWith(appViewState: AppViewState.loading);
    final result = await ref.read(UsesCases.getCreditCardSummaryUseCase).call(
      cardNumber: state.cardNumber,
    );
    result.fold(
      (failure) => state = state.copyWith(appViewState: AppViewState.error),
      (data) => state = state.copyWith(
        appViewState: AppViewState.loaded,
        creditCardSummaryResponse: data,
      ),
    );
  }
}
// Provider generado: homeCreditCardControllerProvider
```

**Global Controller** (ejemplo real: `card_gc.dart` — compartido entre credit/debit):

```dart
// card_gc.dart
part 'card_gc.g.dart';

@Riverpod(keepAlive: true)  // ← uppercase R = persiste en memoria
class CardGC extends _$CardGC {
  @override
  CardState build() {
    return const CardState();
  }
  // Lógica compartida: CVV timer, card lock, etc.
}
// Provider generado: cardGCProvider
```

**State con Freezed** (ejemplo real: `home_credit_card_state.dart`):

```dart
// home_credit_card_state.dart
part 'home_credit_card_state.freezed.dart';

@freezed
abstract class HomeCreditCardState with _$HomeCreditCardState {
  const HomeCreditCardState._();  // ← constructor privado para métodos custom

  const factory HomeCreditCardState({
    @Default(AppViewState.idle) AppViewState appViewState,
    CreditCardSummaryResponseModel? creditCardSummaryResponse,
    CustomerCardModel? customerCard,
    @Default('') String cardNumber,
    // ... más campos
  }) = _HomeCreditCardState;

  static HomeCreditCardState get initialState => const HomeCreditCardState();
}
```

**AppViewState enum** (estados de carga):

```dart
enum AppViewState { idle, loading, loaded, error, empty }
```

#### 4.4.3 Vistas

Existen **dos convenciones** de vista:

| Tipo | Base class | Cuándo usar |
|---|---|---|
| `ConsumerWidget` | Stateless | Vista sin lógica local (el controller maneja todo) |
| `ConsumerStatefulWidget` | Stateful | Vista con TextEditingControllers, initState, dispose |

**Patrón ConsumerWidget** (ejemplo real: `credit_card_home_view.dart`):

```dart
// credit_card_home_view.dart
class CreditCardHomeView extends ConsumerWidget {
  const CreditCardHomeView({
    super.key,
    required this.adaptiveScreen,     // ← recibe instancias adaptativas
    required this.adaptiveSpacing,
    required this.adaptiveFontSize,
  });

  final AdaptiveScreen adaptiveScreen;
  final AdaptiveSpacing adaptiveSpacing;
  final AdaptiveFontSize adaptiveFontSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(homeCreditCardControllerProvider);

    return PushScaffoldGW(                   // ← PushScaffoldGW para push navigation
      title: RemoteConfigKeys.cardsTitle.text,
      body: AppStateHandlerGW(
        state: state.appViewState,            // ← parámetro "state:", no "status:"
        loadingWidget: const CreditCardHomeShimmer(),
        errorWidget: const CreditCardHomeErrorView(),
        onSuccess: SingleChildScrollView(     // ← parámetro "onSuccess:", no "child:"
          child: Column(
            children: [
              CreditCardHeaderW(
                adaptiveScreen: adaptiveScreen,
                adaptiveSpacing: adaptiveSpacing,
                adaptiveFontSize: adaptiveFontSize,
              ),
              CreditCardSubHeaderW(...),
              CreditCardBodyW(...),
              if (state.creditCardSummaryResponse?.paymentAmount != null)
                CreditCardNextPayW(...),
              CreditCardCalendarPaymentCardW(...),
            ],
          ),
        ),
      ),
    );
  }
}
```

**Patrón ConsumerStatefulWidget** (ejemplo real: `credit_card_payment_view.dart`):

```dart
// credit_card_payment_view.dart
class CreditCardPaymentView extends ConsumerStatefulWidget {
  const CreditCardPaymentView({super.key});

  @override
  ConsumerState<CreditCardPaymentView> createState() => _CreditCardPaymentViewState();
}

class _CreditCardPaymentViewState extends ConsumerState<CreditCardPaymentView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(cardPaymentControllerProvider.notifier).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cardPaymentControllerProvider);
    // ... build UI
  }
}
```

> **Nota**: Las vistas reciben `AdaptiveScreen`, `AdaptiveSpacing`, `AdaptiveFontSize` como **parámetros del constructor** y los pasan a sus widgets hijos. Esto evita recrear instancias repetidamente en el tree.

#### 4.4.4 Controladores Globales (`presentation/global/controllers/`)

| Controller | `keepAlive` | Responsabilidad |
|---|---|---|
| `SessionGC` | ✅ | Permisos, user prefs, OTP, keychain, shared prefs |
| `RouterGC` | ✅ | Wrapper de GoRouter: `push()`, `go()`, `pop()` |
| `SignInGC` | ❌ | Flujo de login (device ID, FCM, biometric, base64 password) |
| `BiometricGC` | ❌ | Auth biométrica con CRC, prompt via RemoteConfig |
| `DeepLinkEventGC` | ✅ | Deep link state machine (pending → consumed/error) |
| `NavigatorKeyGC` | ✅ | Navigator key global |
| `SessionDetectorGC` | ❌ | Tracking de actividad de usuario, session timeout, force logout |
| `CurrentRouteGC` | ✅ | Ruta actual para analytics |

#### 4.4.5 Widget Library Global (`presentation/global/widgets/`)

42 widgets reutilizables con sufijo `GW` (Global Widget):

**Scaffolds**:

| Widget | Propósito |
|---|---|
| `ScaffoldGW` | AppBar + SliverAppBar + pull-to-refresh |
| `PushScaffoldGW` | Push navigation con animación |
| `ScaffoldGradientGW` | Fondo con gradient |
| `ErrorScaffoldGW` | Pantalla de error genérica |

**Botones** (`widgets/buttons/` — 9 archivos + subcarpeta `segmented/`):

| Widget | Propósito |
|---|---|
| `BaseButtonGW` | Fundación con `ButtonType` enum y `WidgetStateProperty` |
| `PrimaryButtonGW` | Botón primario (teal filled). Tiene factory `.large` |
| `SecondaryButtonGW` | Botón secundario |
| `OutlinedButtonGW` | Botón outlined |
| `GhostButtonGW` | Botón transparente |
| `ActionButtonGW` | Botón de acción (icon + text / compacto) |
| `ActionButtonWithTermsGW` | Botón de acción con términos y condiciones |
| `SignatureBtnGW` | Botón para firma |
| `segmented/` | Botón segmentado (tabs) |

**Inputs**:

| Widget | Propósito |
|---|---|
| `InputTextGW` | Input con masking, `BaseValidator`, error/success states, `InputValidationMode` (onChange/onBlur) |
| `OtpInputGW` | Input de OTP de N dígitos |
| `DropdownGW` | Dropdown selector |

**Cards**:

| Widget | Propósito |
|---|---|
| `CardGW` | Card base con `CardType` enum (card/productCard/cardShadow) |
| `ListItemGW` | List item con factories: spaced/tight/inverted, avatar, badge |

**Feedback**:

| Widget | Propósito |
|---|---|
| `AppStateHandlerGW` | Maneja idle/loading/success/error/empty + Skeletonizer |
| `FullscreenShimmerGW` | Shimmer de pantalla completa |
| `InfoBannerGW` | Banner informativo |
| `CarouselGW` | PageView con dot indicators |

**Overlays**:

| Widget | Propósito |
|---|---|
| `ActionBottomSheetGW` | Bottom sheet con acciones |
| `ModalDialogGW` | Modal dialog |

**Texto**:

| Widget | Propósito |
|---|---|
| `StyledTextGW` | Parser de `<tag>` + detección de URLs |

#### 4.4.6 Utilidades Globales (`presentation/global/utils/`)

Todas son clases estáticas que acceden al `globalContainer`:

| Utility | Métodos clave |
|---|---|
| `RouterUtil` | `push()`, `go()`, `pop()`, `canPop()`, `pushPageRoute()` |
| `LoaderUtil` | `show()`, `hide()` |
| `ToastUtil` | `show()`, `showCustomWidget()`, `showFilterToast()`, `dismissAll()` |
| `BottomSheetUtil` | `simple()`, `customBody()`, `simpleAsync()`, `input()`, `loaderShow()`, `errorShow()` |
| `SessionErrorHandler` | Maneja códigos de error PLT001-046, GPS001-005, BIO001-002, PCY000, GTW001 |
| `MaskingUtil` | `maskName()`, `maskPhoneNumber()`, `maskEmail()`, `maskAccountNumber()` |
| `CurrencyUtil` | `format()`, `formatCustom()`, `CurrencyInputFormatter` |
| `AppColorUtil` | Colores adaptados a dark mode via `globalContainer` |
| `AppSemanticColorUtil` | Colores semánticos adaptados a dark mode |
| `BaseValidator` | Clase abstracta para validadores de input |

#### 4.4.7 Validadores (`presentation/global/validators/`)

Sistema basado en `BaseValidator` con lista de `ValidatorModel`:

```dart
abstract class BaseValidator {
  List<ValidatorModel> get rules;
  List<ValidatorModel> get success;

  List<String> validate(String value) {
    return rules
        .where((rule) => !rule.isValid(value))
        .map((rule) => rule.message)
        .toList();
  }
}

class ValidatorModel {
  final String message;
  final bool Function(String) isValid;
  final Function(bool)? onError;
}
```

**Validadores disponibles**:

| Validador | Reglas |
|---|---|
| `PasswordValidator` | ≥8 chars, no secuencias, no contiene "crediclub" ni teléfono, upperCase+lowerCase+digit |
| `PasswordConfirmationValidator` | Coincide con password original |
| `EmailValidator` | Regex de email válido |
| `MoneyValidator` | Balance disponible, límite diario/mensual, mín $1.00, max transacciones |
| `NumberValidators` | Longitud de teléfono según país |
| `UserValidator` | No vacío, ≥6 chars |
| `CodeValidator` | Longitud exacta de código |
| `CustomValidator` | Reglas inyectadas dinámicamente |

---

## 5. Flujo Completo de un Feature (Caso: Cards)

### Diagrama de flujo de una llamada API (ej: obtener resumen de tarjeta de crédito)

```
                    ┌───────────────────────────────┐
                    │ CreditCardHomeView (Vista) │
                    │   ref.watch(controller)    │
                    │   build() con state        │
                    └────────────┬──────────────────┘
                                 │
                    ┌────────────▼──────────────────┐
                    │ HomeCreditCardController    │
                    │ (@riverpod Notifier)        │
                    │  state → loading          │
                    │  await useCase.call()     │
                    │  result.fold(...)         │
                    │  state → loaded/error     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ GetCreditCardSummaryUseCase│
                    │  repo.getCreditCardSummary │
                    │  .fold(Failure→FailureView,│
                    │        Data→Right(data))   │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ CreditCardRepositoryImpl  │
                    │  delegates to provider     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ CreditCardProvider        │
                    │  _dioHttpProvider.get(     │
                    │    Endpoints.cardSummary,  │
                    │    queryParams,            │
                    │    converter: fromJson     │
                    │  )                         │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ DioHttpProvider           │
                    │  _dio.get() → Response    │
                    │  converter(res.data)      │
                    │  return Right(data)       │
                    │  OR catch → Left(Failure) │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────▼──────────────────┐
              │           Interceptores Dio          │
              │  CRC → Logger → CriticalError → etc. │
              └──────────────────┬──────────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │      API Backend          │
                    └──────────────────────────┘
```

### Estructura de carpetas del caso Cards:

```
lib/app/
├── domain/
│   ├── models/cards/
│   │   ├── common/                          # Modelos compartidos
│   │   │   ├── card_cvv_response/
│   │   │   ├── card_detail_response/
│   │   │   ├── customer_cards_response/
│   │   │   └── toggle_card_lock/            # Request + Response
│   │   ├── credit_card/                     # Modelos de tarjeta de crédito
│   │   │   ├── credit_card_summary_response/
│   │   │   ├── credit_card_payment_terms/
│   │   │   ├── credit_card_payment_summary/
│   │   │   ├── credit_card_payment_confirmation/
│   │   │   ├── credit_card_purchase_term/
│   │   │   ├── credit_card_scheduled_payment/
│   │   │   ├── customer_card/
│   │   │   └── purchase_simulator/          # Request + Response
│   │   └── debit_card/                      # Placeholder (.gitkeep)
│   └── repositories/cards/
│       ├── common/cards_repository.dart      # Interface abstracta
│       └── credit_card/credit_card_repository.dart
│
├── data/
│   ├── source/api/cards/
│   │   ├── common/
│   │   │   ├── cards_provider.dart           # HTTP calls
│   │   │   └── cards_inject_provider.dart    # DI
│   │   └── credit_card/
│   │       ├── credit_card_provider.dart
│   │       └── credit_card_inject_provider.dart
│   ├── repositories_impl/cards/
│   │   ├── common/cards_repository_impl.dart
│   │   └── credit_card/credit_card_repository_impl.dart
│   └── uses_cases/cards/
│       ├── common/                           # 4 use cases
│       │   ├── get_card_cvv_use_case.dart
│       │   ├── get_card_details_use_case.dart
│       │   ├── get_customer_cards_use_case.dart
│       │   └── toggle_card_lock_use_case.dart
│       └── credit_card/                      # 9 use cases
│           ├── get_credit_card_summary_use_case.dart
│           ├── get_credit_card_payment_terms_use_case.dart
│           ├── get_purchase_simulator_use_case.dart
│           ├── payment_credit_card_use_case.dart
│           ├── update_next_purchase_use_case.dart
│           ├── has_credit_card_tooltip_shown_use_case.dart
│           ├── mark_credit_card_tooltip_shown_use_case.dart
│           ├── has_credit_card_calc_tooltip_shown_use_case.dart
│           └── mark_credit_card_calc_tooltip_shown_use_case.dart
│
└── presentation/modules/cards/
    ├── common/
    │   ├── controllers/                      # CardGC (shared state)
    │   └── widgets/
    ├── credit_card/
    │   ├── home/          controller/ + view/ + widgets/
    │   ├── all_options/   controller/ + view/ + widgets/
    │   ├── card_payment/  controller/ + view/ + widgets/
    │   ├── payment_summary/ controller/ + view/
    │   ├── confirmation/  controller/ + view/
    │   ├── purchase_simulator/ controller/ + view/ + widgets/
    │   ├── select_term/   controller/ + view/ + widgets/
    │   ├── onboarding/    view/
    │   └── widgets/       CreditCardTooltipW
    └── debit_card/
        ├── controller/
        └── views/
```

---

## 6. Sesión 1: Implementación de Servicios / APIs

### Paso 1: Definir el Endpoint

```dart
// core/constants/endpoints.dart
static const Endpoint miNuevoEndpoint = Endpoint(
  endpoint: '/platform/mi-feature/accion',
  version: 1.0,
);
```

### Paso 2: Crear el Modelo (Domain)

```dart
// domain/models/mi_feature/mi_response/mi_response_model.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'mi_response_model.freezed.dart';
part 'mi_response_model.g.dart';

@freezed
abstract class MiResponseModel with _$MiResponseModel {
  const factory MiResponseModel({
    required bool success,
    String? errorCode,
    String? message,
    String? dato1,
    int? dato2,
  }) = _MiResponseModel;

  factory MiResponseModel.fromJson(Map<String, dynamic> json) =>
      _$MiResponseModelFromJson(json);
}
```

**Ejecutar generación de código**:

```bash
dart run build_runner build --delete-conflicting-outputs
```

### Paso 3: Crear el Repositorio Abstracto (Domain)

```dart
// domain/repositories/mi_feature/mi_feature_repository.dart
import 'package:crediclub/app/core/network/failure.dart';
import 'package:crediclub/app/domain/defs/type_defs.dart';
import 'package:crediclub/app/domain/models/mi_feature/mi_response/mi_response_model.dart';

abstract class MiFeatureRepository {
  FutureEither<Failure, MiResponseModel> obtenerDatos({required String id});
}
```

### Paso 4: Crear el API Provider (Data/Source)

```dart
// data/source/api/mi_feature/mi_feature_provider.dart
import 'package:crediclub/app/core/constants/endpoints.dart' as constants;
import 'package:crediclub/app/core/network/failure.dart';
import 'package:crediclub/app/data/source/providers/dio/dio_http_provider.dart';
import 'package:crediclub/app/domain/defs/type_defs.dart';
import 'package:crediclub/app/domain/models/mi_feature/mi_response/mi_response_model.dart';

class MiFeatureProvider {
  const MiFeatureProvider({required DioHttpProvider dioHttpProvider})
    : _dioHttpProvider = dioHttpProvider;

  final DioHttpProvider _dioHttpProvider;

  FutureEither<Failure, MiResponseModel> obtenerDatos({required String id}) async {
    final queryParams = <String, dynamic>{'Id': id};
    return await _dioHttpProvider.get(
      constants.Endpoints.miNuevoEndpoint.endpoint,
      headers: {'api-version': constants.Endpoints.miNuevoEndpoint.version},
      queryParameters: queryParams,
      converter: (json) => MiResponseModel.fromJson(json as Map<String, dynamic>),
    );
  }
}
```

```dart
// data/source/api/mi_feature/mi_feature_inject_provider.dart
import 'package:crediclub/app/core/injects_providers/dio/dio_inject_provider.dart';
import 'package:crediclub/app/data/source/api/mi_feature/mi_feature_provider.dart';
import 'package:meta/meta.dart';
import 'package:riverpod/riverpod.dart';

class MiFeatureInjectProvider {
  const MiFeatureInjectProvider._();

  @visibleForTesting
  static void testConstructor() {
    final instance = const MiFeatureInjectProvider._();
    instance;
  }

  static final miFeatureProvider = Provider(
    (ref) => MiFeatureProvider(
      dioHttpProvider: ref.read(DioInjectProvider.dioProvider),
    ),
  );
}
```

### Paso 5: Implementar el Repositorio (Data)

```dart
// data/repositories_impl/mi_feature/mi_feature_repository_impl.dart
import 'package:crediclub/app/core/network/failure.dart';
import 'package:crediclub/app/data/source/api/mi_feature/mi_feature_provider.dart';
import 'package:crediclub/app/domain/defs/type_defs.dart';
import 'package:crediclub/app/domain/models/mi_feature/mi_response/mi_response_model.dart';
import 'package:crediclub/app/domain/repositories/mi_feature/mi_feature_repository.dart';

class MiFeatureRepositoryImpl implements MiFeatureRepository {
  const MiFeatureRepositoryImpl({required MiFeatureProvider miFeatureProvider})
    : _miFeatureProvider = miFeatureProvider;

  final MiFeatureProvider _miFeatureProvider;

  @override
  FutureEither<Failure, MiResponseModel> obtenerDatos({required String id}) {
    return _miFeatureProvider.obtenerDatos(id: id);
  }
}
```

### Paso 6: Crear el Use Case (Data)

```dart
// data/uses_cases/mi_feature/obtener_datos_use_case.dart
import 'package:crediclub/app/core/network/either.dart';
import 'package:crediclub/app/core/network/handle_failure.dart';
import 'package:crediclub/app/core/utils/failure_view_data.dart';
import 'package:crediclub/app/domain/models/mi_feature/mi_response/mi_response_model.dart';
import 'package:crediclub/app/domain/repositories/mi_feature/mi_feature_repository.dart';

class ObtenerDatosUseCase {
  const ObtenerDatosUseCase({required MiFeatureRepository miFeatureRepository})
    : _miFeatureRepository = miFeatureRepository;

  final MiFeatureRepository _miFeatureRepository;

  Future<Either<FailureViewData, MiResponseModel>> call({required String id}) async {
    final result = await _miFeatureRepository.obtenerDatos(id: id);
    return result.fold(
      (failure) => Left(mapFailureToView(failure)),
      (data) => Right(data),
    );
  }
}
```

### Paso 7: Registrar en DI

```dart
// domain/repositories/inject_repository.dart (agregar)
static final miFeatureRepository = Provider<MiFeatureRepository>(
  (ref) => MiFeatureRepositoryImpl(
    miFeatureProvider: ref.read(MiFeatureInjectProvider.miFeatureProvider),
  ),
);
```

```dart
// data/uses_cases/uses_cases.dart (agregar)
static final obtenerDatosUseCase = Provider(
  (ref) => ObtenerDatosUseCase(
    miFeatureRepository: ref.read(InjectRepository.miFeatureRepository),
  ),
);
```

```dart
// data/uses_cases/index_uses_cases.dart (agregar)
export 'mi_feature/obtener_datos_use_case.dart';
```

```dart
// data/repositories_impl/index_repositories_impl.dart (agregar)
export 'mi_feature/mi_feature_repository_impl.dart';
```

```dart
// data/source/index_injects_providers.dart (agregar)
export 'api/mi_feature/mi_feature_inject_provider.dart';
```

---

## 7. Sesión 2: Manejo de Vistas, Widgets, Colores, Tipografía y Spacing

### 7.1 Estructura de una Vista Completa

**Variante ConsumerWidget** (preferida cuando no hay estado local):

```dart
class MiFeatureView extends ConsumerWidget {
  const MiFeatureView({
    super.key,
    required this.adaptiveScreen,
    required this.adaptiveSpacing,
    required this.adaptiveFontSize,
  });

  final AdaptiveScreen adaptiveScreen;
  final AdaptiveSpacing adaptiveSpacing;
  final AdaptiveFontSize adaptiveFontSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(miFeatureControllerProvider);

    return PushScaffoldGW(
      title: RemoteConfigKeys.miFeatureTitle.text,
      body: AppStateHandlerGW(
        state: state.appViewState,
        loadingWidget: const MiFeatureShimmer(),
        errorWidget: const MiFeatureErrorView(),
        onSuccess: _buildContent(state),
      ),
    );
  }

  Widget _buildContent(MiFeatureState state) {
    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(
        horizontal: adaptiveSpacing.lg,   // 16px adaptativo
        vertical: adaptiveSpacing.xl,     // 24px adaptativo
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            RemoteConfigKeys.miFeatureTitle.text,
            style: adaptiveFontSize.system.xl.bold.carbon100,
          ),
          SizedBox(height: adaptiveSpacing.base), // 8px
          Text(
            'Descripción del feature',
            style: adaptiveFontSize.system.base.medium.carbon60,
          ),
          SizedBox(height: adaptiveSpacing.xl), // 24px
          // ... más widgets
        ],
      ),
    );
  }
}
```

**Variante ConsumerStatefulWidget** (cuando se necesita initState, dispose, TextEditingControllers):

```dart
class MiFeatureFormView extends ConsumerStatefulWidget {
  const MiFeatureFormView({super.key});

  @override
  ConsumerState<MiFeatureFormView> createState() => _MiFeatureFormViewState();
}

class _MiFeatureFormViewState extends ConsumerState<MiFeatureFormView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(miFeatureControllerProvider.notifier).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    final adaptiveScreen = AdaptiveScreen(context);
    final adaptiveSpacing = AdaptiveSpacing(context);
    final fonts = AdaptiveFontSize(context);

    final state = ref.watch(miFeatureControllerProvider);

    return PushScaffoldGW(
      title: RemoteConfigKeys.miFeatureTitle.text,
      body: AppStateHandlerGW(
        state: state.appViewState,
        loadingWidget: const FullscreenShimmerGW(),
        errorWidget: Text(state.error ?? ''),
        onSuccess: SingleChildScrollView(
          padding: EdgeInsets.symmetric(
            horizontal: adaptiveSpacing.lg,
            vertical: adaptiveSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                RemoteConfigKeys.miFeatureTitle.text,
                style: fonts.system.xl.bold.carbon100,
              ),
              SizedBox(height: adaptiveSpacing.base),
              CardGW(
                type: CardType.card,
                child: Padding(
                  padding: EdgeInsets.all(adaptiveSpacing.lg),
                  child: Column(
                    children: [
                      ListItemGW.spaced(title: 'Campo', subtitle: state.data?.valor ?? ''),
                    ],
                  ),
                ),
              ),
              SizedBox(height: adaptiveSpacing.xxl),
              PrimaryButtonGW(
                text: RemoteConfigKeys.continueButton.text,
                onPressed: () => _handleAction(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### 7.2 Colores — Uso Correcto

```dart
// ❌ INCORRECTO — nunca usar colores hardcodeados
Container(color: Color(0xFF00A69C))

// ✅ CORRECTO — usar AppColorUtil o SemanticColors
Container(color: AppColorUtil().tealDark)
Container(color: AppSemanticColorUtil().cardBackground)

// ✅ CORRECTO — en TextStyle con extension
Text('Hola', style: fonts.system.lg.bold.tealDark)
Text('Error', style: fonts.system.base.errorText)
Text('Info', style: fonts.system.sm.carbon60)
```

**Paleta de colores disponibles (vía `AppColorUtil`)**:

| Nombre | Uso |
|---|---|
| `primary` | Color principal (negro/carbon) |
| `teal` | Acento principal |
| `tealDark` | Acento oscuro |
| `alert` | Rojo de error |
| `greenBase` | Verde de éxito |
| `white` | Blanco |
| `carbon40/50/60/80/100` | Escala de grises |
| `grayMedium` | Gris info |
| `textSecondaryNeutral` | Texto secundario |

### 7.3 Tipografía — Escala Completa

| Token | Base px | Familia | Uso |
|---|---|---|---|
| `system.sm` | 10 | Area | Etiquetas pequeñas, timestamps |
| `system.base` | 13 | Area | Texto body, descripciones |
| `system.subtitle` | 15 | Area | Subtítulos especiales |
| `system.lg` | 16 | Area | Texto body grande, labels |
| `system.xl` | 24 | Area | Títulos de sección |
| `system.xl2` | 32 | Area | Títulos principales |
| `system.xl2Display` | 40 | Area | Títulos hero |
| `display.sm/base/lg/xl/xl2` | Mismos | PP-Fragment-Glare | Títulos decorativos |
| `metric.base` | 16 | Area | Métricas |
| `metric.large` | 32 | Area | Números grandes |

**Modificadores encadenables**:

```dart
fonts.system.lg          // Regular, Area, 16px
fonts.system.lg.bold     // Bold (w700)
fonts.system.lg.medium   // Medium (w500)
fonts.system.lg.bold.tealDark    // Bold + color teal
fonts.system.xl2.white           // Extra large + blanco
fonts.display.xl.bold.carbon80   // Display + bold + gris
```

### 7.4 Spacing — Escala Adaptativa

```dart
final s = AdaptiveSpacing(context);

// Uso en padding
EdgeInsets.all(s.lg)                    // 16px all
EdgeInsets.symmetric(horizontal: s.lg)  // 16px horizontal
EdgeInsets.only(top: s.xl, bottom: s.lg) // 24px top, 16px bottom

// Uso en SizedBox
SizedBox(height: s.base)   //  8px gap
SizedBox(height: s.md)     // 12px gap
SizedBox(height: s.lg)     // 16px gap
SizedBox(height: s.xl)     // 24px gap
SizedBox(height: s.xxl)    // 32px gap
SizedBox(height: s.safe)   // 60px safe area
```

| Token | Valor base | Uso típico |
|---|---|---|
| `sx` | 2px | Micro-spacing, bordes |
| `sm` | 4px | Spacing tight entre chips/tags |
| `base` | 8px | Spacing estándar entre elementos |
| `md` | 12px | Spacing medium |
| `lg` | 16px | Padding default de containers |
| `xl` | 24px | Separación entre secciones |
| `xxl` | 32px | Separación entre bloques |
| `xxxl` | 44px | Separación grande |
| `safe` | 60px | Safe area bottom |

### 7.5 Widgets Globales — Catálogo de Uso

**AppStateHandlerGW** — Maneja todos los estados de carga:

```dart
AppStateHandlerGW(
  state: state.appViewState,           // AppViewState (← parámetro "state:", no "status:")
  loadingWidget: FullscreenShimmerGW(), // Shimmer placeholder
  errorWidget: Text('Error'),          // Widget de error custom
  onSuccess: MiContenidoWidget(),      // Contenido cuando loaded (← "onSuccess:", no "child:")
)
```

**CardGW** — Card reusable:

```dart
CardGW(
  type: CardType.card,           // card | productCard | cardShadow
  child: Padding(
    padding: EdgeInsets.all(spacing.lg),
    child: Column(...),
  ),
)
```

**ListItemGW** — Items de lista con factories:

```dart
ListItemGW.spaced(title: 'Saldo', subtitle: '\$10,000.00')
ListItemGW.spacedWithTooltip(title: 'Info', subtitle: 'Dato', tooltipMessage: 'Ayuda')
ListItemGW.tight(title: 'Campo', subtitle: 'Valor')
ListItemGW.inverted(title: 'Etiqueta', subtitle: 'Contenido')
```

**InputTextGW** — Input con validación:

```dart
InputTextGW(
  label: 'Correo electrónico',
  controller: _emailController,
  validator: EmailValidator(),
  validationMode: InputValidationMode.onBlur,
  keyboardType: TextInputType.emailAddress,
  onChanged: (value) => _handleChange(value),
)
```

**PrimaryButtonGW** — Botón primario:

```dart
PrimaryButtonGW(
  text: 'Continuar',
  onPressed: isFormValid ? () => _submit() : null,  // null = disabled
  isLoading: state.isSubmitting,
)
```

**BottomSheetUtil** — Bottom sheets programáticos:

```dart
// Simple con título y cuerpo
BottomSheetUtil.simple(
  title: 'Seleccionar cuenta',
  body: ListView(...),
);

// Con loader
BottomSheetUtil.loaderShow();
// ... carga
BottomSheetUtil.loaderHide();

// Error
BottomSheetUtil.errorShow(message: 'No se pudo procesar');

// Async con resultado
final result = await BottomSheetUtil.simpleAsync<String>(
  title: 'Seleccionar',
  body: ListView(...),
);
```

**ToastUtil** — Toasts:

```dart
ToastUtil.show(message: 'Operación exitosa', type: ToastType.success);
ToastUtil.show(message: 'Error al procesar', type: ToastType.error);
```

**LoaderUtil** — Loader de pantalla completa:

```dart
LoaderUtil.show();
// ... operación async
LoaderUtil.hide();
```

### 7.6 Widgets Específicos de Feature

Los widgets específicos del feature van dentro de `widgets/` del módulo:

```
modules/cards/credit_card/home/widgets/
├── credit_card_header_w.dart               # Sufijo _w (widget de feature)
├── credit_card_sub_header_w.dart
├── credit_card_body_w.dart
├── credit_card_next_pay_w.dart
├── credit_card_calendar_payment_card_w.dart
├── credit_card_details_bottom_sheet.dart
├── credit_card_home_shimmer.dart
├── digital_card_btn_w.dart
├── dot_w.dart
├── sequential_animated_text_w.dart
└── animated/
    ├── animated_button.dart
    └── animated_detail_field.dart
```

**Convención**: reciben `AdaptiveScreen`, `AdaptiveSpacing`, `AdaptiveFontSize` como parámetros del constructor (no los crean internamente).

### 7.7 Textos desde Remote Config

```dart
// NUNCA hardcodear textos de UI
Text('Bienvenido')  // ❌

// SIEMPRE usar Remote Config
Text(RemoteConfigKeys.welcomeTitle.text)  // ✅

// Con variables
Text(RemoteConfigKeys.depositedExceeds.textWithVars(['diario', '\$1,000']))  // ✅
Text(RemoteConfigKeys.enterAnAmountError.textWithVar('1.00'))  // ✅
```

---

## 8. Inyección de Dependencias (DI)

### Flujo de DI completo:

```
┌─────────────────────────────────────────────────┐
│ UsesCases.miUseCase (Provider<MiUseCase>)        │
│   └─ MiUseCase(repo: InjectRepository.miRepo)   │
│       └─ InjectRepository.miRepo (Provider)      │
│           └─ MiRepoImpl(provider: MiInject.prov) │
│               └─ MiInjectProvider.provider        │
│                   └─ MiProvider(dio: DioInject)   │
│                       └─ DioInjectProvider        │
│                           └─ DioHttpProvider(dio) │
│                               └─ DioInstance.dio  │
└─────────────────────────────────────────────────┘
```

### Registros centrales:

| Registro | Archivo | Contenido |
|---|---|---|
| **Inject Providers (Source)** | `data/source/index_injects_providers.dart` | Exports de API inject providers |
| **Repo Implementations** | `data/repositories_impl/index_repositories_impl.dart` | Exports de todas las implementaciones |
| **Use Cases Index** | `data/uses_cases/index_uses_cases.dart` | Exports de todos los use cases |
| **Use Cases Registry** | `data/uses_cases/uses_cases.dart` | ~80 `Provider<UseCase>` con DI |
| **Repository DI** | `domain/repositories/inject_repository.dart` | ~35 `Provider<Repository>` con DI |

### Global Container:

```dart
// global.dart
late final ProviderContainer globalContainer;

// main_with_flavor.dart
globalContainer = ProviderContainer(
  overrides: [flavorProvider.overrideWithValue(flavor)],
);
```

El `globalContainer` se usa para acceder a providers **fuera del widget tree** (utilidades estáticas, interceptores, etc.).

---

## 9. Navegación (Routing)

### GoRouter Provider:

```dart
final goRouterProvider = Provider((ref) {
  final router = GoRouter(
    navigatorKey: ref.read(navigatorKeyGCProvider).navigatorKey,
    initialLocation: OnboardingRoute.path,
    routes: [
      OnboardingRoute.route,
      SignInRoute.route,
      // ... 50+ rutas
      StatefulShellRoute.indexedStack(  // Bottom nav tabs
        branches: [
          StatefulShellBranch(routes: [HomeRoute.route]),
          StatefulShellBranch(routes: [MyInvestmentsRoute.route]),
          StatefulShellBranch(routes: [/* cards placeholder */]),
          StatefulShellBranch(routes: [/* star placeholder */]),
        ],
      ),
      ...CreditCardRoutes.routes,
    ],
  );
  return router;
});
```

### Definición de una Ruta:

```dart
// app_routes/credit_card/credit_card_home_route.dart
class CreditCardHomeRoute {
  static const path = '/credit-card-home';

  static final route = GoRoute(
    path: path,
    name: 'credit-card-home',
    builder: (context, state) => CreditCardHomeView(
      adaptiveScreen: AdaptiveScreen(context),
      adaptiveSpacing: AdaptiveSpacing(context),
      adaptiveFontSize: AdaptiveFontSize(context),
    ),
  );
}
```

### Uso de Navegación:

```dart
// Desde cualquier parte con RouterUtil (estático)
RouterUtil.push(CreditCardHomeRoute.path);
RouterUtil.go(HomeRoute.path);
RouterUtil.pop();

// Desde un widget con ref
ref.read(routerGCProvider.notifier).push(CreditCardHomeRoute.path);

// Con extra data
RouterUtil.push(CreditCardPaymentRoute.path, extra: paymentModel);
```

---

## 10. Convenciones de Nombrado

### Sufijos de Archivos:

**Controladores y Vistas** (dos convenciones según scope):

| Sufijo | Tipo | Clase | Ejemplo real |
|---|---|---|---|
| `_gc.dart` | Controller global/compartido | `CardGC`, `SessionGC`, `RouterGC` | `card_gc.dart`, `session_gc.dart` |
| `_controller.dart` | Controller de feature | `HomeCreditCardController`, `CardPaymentController` | `home_credit_card_controller.dart` |
| `_state.dart` | Estado Freezed | `HomeCreditCardState`, `CardState` | `home_credit_card_state.dart` |
| `_view.dart` | Vista de feature | `CreditCardHomeView`, `CreditCardPaymentView` | `credit_card_home_view.dart` |
| `_gw.dart` | Widget global reutilizable | `ScaffoldGW`, `PrimaryButtonGW` | `scaffold_gw.dart` |
| `_w.dart` | Widget específico de feature | `CreditCardHeaderW` | `credit_card_header_w.dart` |

**Capa Data/Domain** (sin variantes):

| Sufijo | Tipo | Ejemplo |
|---|---|---|
| `_model.dart` | Modelo Freezed | `card_cvv_response_model.dart` |
| `_use_case.dart` | Caso de uso | `get_card_details_use_case.dart` |
| `_repository.dart` | Repositorio abstracto | `cards_repository.dart` |
| `_repository_impl.dart` | Implementación de repositorio | `cards_repository_impl.dart` |
| `_provider.dart` | Provider HTTP / API | `cards_provider.dart` |
| `_inject_provider.dart` | Provider de inyección | `cards_inject_provider.dart` |
| `_route.dart` | Definición de ruta | `credit_card_home_route.dart` |
| `_ext.dart` | Extension | `strings_ext.dart` |
| `_util.dart` | Utilidad estática | `currency_util.dart` |
| `_validator.dart` | Validador | `password_validator.dart` |

### Prefijos de Widgets en Cards:

| Prefijo | Feature |
|---|---|
| `credit_card_` | Widgets/vistas de tarjeta de crédito |
| `card_` | Widgets/controllers compartidos |
| `digital_card_` | Widgets de tarjeta digital |

### Nombres de Providers Riverpod (generados):

```dart
// Global Controllers → nombreGCProvider
cardGCProvider             // de CardGC en card_gc.dart
sessionGCProvider          // de SessionGC en session_gc.dart
routerGCProvider           // de RouterGC en router_gc.dart

// Feature Controllers → nombreControllerProvider
homeCreditCardControllerProvider    // de HomeCreditCardController
cardPaymentControllerProvider       // de CardPaymentController
allOptionsControllerProvider        // de AllOptionsController
selectTermControllerProvider        // de SelectTermController

// Use Case → UsesCases.camelCaseUseCase
UsesCases.getCardDetailsUseCase
UsesCases.getCreditCardSummaryUseCase

// Repository → InjectRepository.camelCaseRepository
InjectRepository.cardsRepository
InjectRepository.creditCardRepository
```

---

## 11. Manejo de Errores

### Cadena de errores:

```
DioException → DioHttpProvider._mapError() → Failure
  → UseCase.fold() → FailureViewData (icon + message + errorCode)
    → Controller.state.error → Vista muestra error

// O para errores críticos:
DioException → CriticalErrorInterceptor → forceLogout()
```

### Tipos de Failure y sus causas:

| Failure | Cuando |
|---|---|
| `NetworkFailure` | Sin internet, SSL error |
| `TimeoutFailure` | Timeout de request |
| `ApiFailure` | 404, 5xx, respuesta inesperada |
| `AuthFailure` | 400, 401, 403 |
| `ValidationFailure` | 422 |
| `BusinessFailure` | `success: false` en response body |
| `NoDataFailure` | Sin datos para mostrar |
| `StorageFailure` | Error de almacenamiento local |
| `UnknownFailure` | Cualquier otro error |

### SessionErrorHandler:

Maneja códigos de error específicos de la app:

```
PLT001-PLT046  → Errores de plataforma (sesión, login, permisos)
GPS001-GPS005  → Errores de geolocalización
BIO001-BIO002  → Errores biométricos
PCY000         → Política de seguridad
GTW001         → Gateway error
```

---

## 12. Guía Rápida para Crear un Nuevo Módulo

### Checklist de archivos a crear:

```
--- CAPA DOMAIN ---
1. ☐ Endpoint en core/constants/endpoints.dart
2. ☐ Modelo(s) en domain/models/mi_feature/
3. ☐ Repositorio abstracto en domain/repositories/mi_feature/

--- CAPA DATA ---
4. ☐ API Provider en data/source/api/mi_feature/mi_feature_provider.dart
5. ☐ Inject Provider en data/source/api/mi_feature/mi_feature_inject_provider.dart
6. ☐ Repositorio impl en data/repositories_impl/mi_feature/
7. ☐ Use Case(s) en data/uses_cases/mi_feature/
8. ☐ Registrar en InjectRepository (inject_repository.dart)
9. ☐ Registrar en UsesCases (uses_cases.dart)
10. ☐ Registrar exports en index files (3 archivos: index_uses_cases, index_repositories_impl, index_injects_providers)

--- CAPA PRESENTATION ---
11. ☐ Controller en presentation/modules/mi_feature/controller/mi_feature_controller.dart  ← sufijo _controller
12. ☐ State en presentation/modules/mi_feature/controller/mi_feature_state.dart
13. ☐ View en presentation/modules/mi_feature/view/mi_feature_view.dart  ← sufijo _view
14. ☐ Widgets específicos en presentation/modules/mi_feature/widgets/  ← sufijo _w
15. ☐ Ruta en presentation/router/app_routes/mi_feature/
16. ☐ Agregar ruta al GoRouter en go_router_provider.dart
17. ☐ Ejecutar: dart run build_runner build --delete-conflicting-outputs
```

> **Nota sobre naming**: Los controllers de feature usan `@riverpod` (lowercase, auto-dispose) y sufijo `_controller.dart`. Solo usa `@Riverpod(keepAlive: true)` y sufijo `_gc.dart` si el controller es **compartido globalmente** entre múltiples features.

### Comandos útiles:

```bash
# Generar código Freezed + Riverpod
dart run build_runner build --delete-conflicting-outputs

# Generar código en modo watch
dart run build_runner watch --delete-conflicting-outputs

# Limpiar y reconstruir
flutter clean && flutter pub get && dart run build_runner build --delete-conflicting-outputs
```

---

## Apéndice: Bootstrap de la App

```
main_dev.dart
  └─ mainWithFlavor(AppFlavor.development)
      ├─ WidgetsFlutterBinding.ensureInitialized()
      ├─ globalContainer = ProviderContainer(overrides: [flavorProvider])
      ├─ SystemChrome.setPreferredOrientations([portrait])
      └─ Dynatrace.start(
           UncontrolledProviderScope(container: globalContainer,
             child: CredoAppBehavioral(
               child: MyApp()
                 └─ _appInitProvider.when(
                      data: ToastificationWrapper(
                        child: StateApp(
                          body: SessionDetectorGw(
                            child: Stack([
                              MaterialApp.router(
                                routerConfig: goRouter,
                                theme: ThemeApp.lightTheme,
                                locale: Locale('es', 'MX'),
                              ),
                              LoaderGv(),  // Overlay de loading
                            ])
                          )
                        )
                      ),
                      loading: Scaffold(LoaderIndicatorGW),
                      error: ErrorScaffoldGw(),
                    )
             )
           )
         )
```

**StateApp** inicializa:

1. `routerGC.onInit(goRouter)`
2. `sessionGC.clearKeychainValues()`
3. `sessionGC.initPermission()`
4. `sessionGC.onInitSharedPreferences()`
5. `sessionGC.initializeSessionManager(ref)`
