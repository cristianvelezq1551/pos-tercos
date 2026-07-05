@echo off
echo Desinstalando el arranque automatico del print-agent ...
schtasks /End /TN "TercosPrintAgent" >nul 2>&1
schtasks /Delete /TN "TercosPrintAgent" /F >nul 2>&1
taskkill /F /IM tercos-print-agent.exe >nul 2>&1
echo.
echo Listo. El print-agent ya NO arranca solo.
echo La carpeta C:\TercosPOS y sus archivos quedan; podes borrarlos a mano.
echo.
pause
