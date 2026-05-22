import 'package:flutter/material.dart';

/// Tema oscuro de alto contraste para tablet de cocina.
/// Colores pensados para legibilidad a distancia y bajo luz intensa.
abstract class AppTheme {
  // Colores semánticos KDS — alto contraste para tablet con poco brillo.
  static const Color background = Color(0xFF0A0E16); // casi negro
  static const Color surface = Color(0xFF1A2330); // card
  static const Color surfaceVariant = Color(0xFF2C3848);
  static const Color border = Color(0xFF5A6678); // borde más claro = cards delimitadas

  static const Color primary = Color(0xFF4D8DFF); // azul vivo
  static const Color primaryDark = Color(0xFF1D4ED8);
  static const Color success = Color(0xFF2EE06A); // verde vivo — "marcar listo" / a tiempo
  static const Color successDark = Color(0xFF15803D);
  static const Color error = Color(0xFFFF5A5A); // rojo vivo — > 10 min / urgente
  static const Color warning = Color(0xFFFFB224); // ámbar vivo — 7-10 min

  static const Color textPrimary = Color(0xFFFFFFFF); // blanco puro
  static const Color textSecondary = Color(0xFFC7D0DD); // gris claro legible
  static const Color textMuted = Color(0xFF93A0B2);

  static const Color badgeCounter = Color(0xFFEF2D3C); // rojo vivo — badge KDS

  static ThemeData get darkTheme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: background,
        colorScheme: const ColorScheme.dark(
          primary: primary,
          surface: surface,
          error: error,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1F2937),
          foregroundColor: textPrimary,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        cardTheme: const CardThemeData(
          color: surface,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            side: BorderSide(color: border, width: 1),
          ),
          margin: EdgeInsets.zero,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            minimumSize: const Size.fromHeight(56), // botones grandes para tablet
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surfaceVariant,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: primary, width: 2),
          ),
          labelStyle: const TextStyle(color: textSecondary),
          hintStyle: const TextStyle(color: textMuted),
        ),
        textTheme: const TextTheme(
          displayLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
          headlineLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
          headlineMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
          titleLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
          titleMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w500),
          bodyLarge: TextStyle(color: textPrimary),
          bodyMedium: TextStyle(color: textSecondary),
          labelLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
        ),
      );
}
