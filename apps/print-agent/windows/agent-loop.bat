@echo off
REM Bucle de reinicio: si el print-agent se cierra o se cae, lo vuelve a abrir.
REM La instancia unica la garantiza el propio agent (el puerto es el candado:
REM una copia de mas sale sola con codigo 0 y este bucle reintenta sin problema).
cd /d "%~dp0"
:loop
"%~dp0tercos-print-agent.exe"
timeout /t 3 /nobreak >nul
goto loop
