' Lanza el bucle del print-agent SIN ventana (totalmente oculto).
' Asi el cajero nunca ve una ventana negra ni la puede cerrar por error.
Dim sh, here
Set sh = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "cmd /c """ & here & "agent-loop.bat""", 0, False
