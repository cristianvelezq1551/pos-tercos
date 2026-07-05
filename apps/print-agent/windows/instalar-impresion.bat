@echo off
setlocal
set "DEST=C:\TercosPOS"
set "SRC=%~dp0"

echo ============================================
echo    Instalador de impresion - Tercos
echo ============================================
echo.

REM --- Requiere administrador (crear la tarea programada) ---
net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: hay que ejecutar este archivo como ADMINISTRADOR.
  echo   Cerra esta ventana, clic derecho sobre instalar-impresion.bat
  echo   y elegi "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

echo Copiando archivos a %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%tercos-print-agent.exe" "%DEST%\" >nul
copy /Y "%SRC%agent-loop.bat" "%DEST%\" >nul
copy /Y "%SRC%start-hidden.vbs" "%DEST%\" >nul
if exist "%SRC%.env" copy /Y "%SRC%.env" "%DEST%\" >nul

echo Desbloqueando archivos (vienen de otro equipo) ...
powershell -NoProfile -Command "Get-ChildItem '%DEST%' -Recurse | Unblock-File" >nul 2>&1

echo Limpiando instalacion previa (si habia) ...
schtasks /End /TN "TercosPrintAgent" >nul 2>&1
schtasks /Delete /TN "TercosPrintAgent" /F >nul 2>&1
taskkill /F /IM tercos-print-agent.exe >nul 2>&1

echo Registrando arranque automatico al iniciar sesion ...
schtasks /Create /TN "TercosPrintAgent" /TR "wscript.exe %DEST%\start-hidden.vbs" /SC ONLOGON /RL LIMITED /F
if errorlevel 1 (
  echo.
  echo ERROR: no se pudo registrar la tarea programada.
  pause
  exit /b 1
)

echo Arrancando el print-agent ahora ...
start "" wscript.exe "%DEST%\start-hidden.vbs"

echo.
echo ============================================
echo    LISTO
echo ============================================
echo  - El print-agent arranca SOLO al iniciar sesion.
echo  - No hay que abrir nada mas: prendes la PC,
echo    abris el POS en el navegador y a trabajar.
echo  - Carpeta instalada: %DEST%
echo.
echo  Prueba ahora: abri en el navegador
echo      http://localhost:9120/health
echo  Debe responder algo como:  {"ok":true,...}
echo.
pause
