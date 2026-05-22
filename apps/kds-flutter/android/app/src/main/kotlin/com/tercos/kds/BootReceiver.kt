package com.tercos.kds

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Autostart: cuando la tablet termina de prender, lanza el KDS solo.
 * Requiere el permiso RECEIVE_BOOT_COMPLETED + el receiver en el manifest.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            val launch = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(launch)
        }
    }
}
