package com.tercos.kds

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import io.flutter.embedding.android.FlutterActivity

/**
 * Modo kiosko: re-entra en lock task (screen pinning) cada vez que la app gana
 * foco, para que no se pueda cerrar/minimizar. Best-effort y a prueba de fallos:
 * cualquier excepción se traga (no debe tumbar la app — antes crasheaba al salir
 * del pinning).
 *
 * Para un kiosko INQUEBRANTABLE (sin que el usuario pueda salir con Atrás+Recientes)
 * la tablet debe estar provisionada como "device owner" y la app whitelisteada:
 *   adb shell dpm set-device-owner com.tercos.kds/...
 * Sin device-owner, startLockTask() entra en pinning "suave".
 */
class MainActivity : FlutterActivity() {
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Re-pinear solo cuando la app está en foreground y con foco. Es más
        // robusto que onResume (que puede dispararse sin foco aún).
        if (hasFocus) enterLockTask()
    }

    private fun enterLockTask() {
        try {
            if (isFinishing || isDestroyed) return
            val am = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
                ?: return
            val alreadyLocked =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
                } else {
                    @Suppress("DEPRECATION")
                    am.isInLockTaskMode
                }
            if (!alreadyLocked) {
                startLockTask()
            }
        } catch (_: Throwable) {
            // Equipos sin soporte / sin device-owner / estado inválido: best-effort.
        }
    }
}
