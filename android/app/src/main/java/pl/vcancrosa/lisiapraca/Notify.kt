package pl.vcancrosa.lisiapraca

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

object Notify {

    const val ONGOING_ID = 1
    private const val CH_SHIFT = "shift"
    private const val CH_ALERT = "alerts"

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_SHIFT, "Zmiana w toku", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERT, "Kursy", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 120, 80, 120)
            }
        )
    }

    private fun openApp(ctx: Context, extra: String? = null, code: Int = 0): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (extra != null) i.putExtra(extra, true)
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun ongoing(ctx: Context, capturing: Boolean): Notification =
        Notification.Builder(ctx, CH_SHIFT)
            .setSmallIcon(R.drawable.ic_tile)
            .setContentTitle("Lisia Praca – zmiana trwa")
            .setContentText(
                if (capturing) "Kafelek „Nowy kurs” jest gotowy"
                else "Kafelek wyłączony. Otwórz aplikację, żeby go włączyć."
            )
            .setOngoing(true)
            .setContentIntent(openApp(ctx))
            .build()

    fun updateOngoing(ctx: Context, capturing: Boolean) {
        if (!canPost(ctx)) return
        ctx.getSystemService(NotificationManager::class.java).notify(ONGOING_ID, ongoing(ctx, capturing))
    }

    fun offerSaved(ctx: Context, text: String) {
        val money = Regex("(\\d{1,4}[,.]\\d{2})\\s*(zł|PLN)", RegexOption.IGNORE_CASE).findAll(text)
            .map { it.groupValues[1] }
            .maxByOrNull { it.replace(',', '.').toDoubleOrNull() ?: 0.0 }
        val minutes = Regex("(\\d{1,3})\\s*min", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
        val body = listOfNotNull(money?.let { "$it zł" }, minutes?.let { "$it min do klienta" })
            .joinToString(" · ")
            .ifEmpty { "Nie odczytałem kwoty – popraw w aplikacji" }
        post(ctx, 2, "Kurs zapisany", body, openApp(ctx, code = 2))
    }

    fun arrived(ctx: Context) =
        post(ctx, 3, "Jesteś na miejscu", "Doprecyzuj adres i zaznacz, czy klient wsiadł", openApp(ctx, "arrived", 3))

    private fun canPost(ctx: Context) =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun post(ctx: Context, id: Int, title: String, text: String, pi: PendingIntent) {
        if (!canPost(ctx)) return
        channels(ctx)
        ctx.getSystemService(NotificationManager::class.java).notify(
            id,
            Notification.Builder(ctx, CH_ALERT)
                .setSmallIcon(R.drawable.ic_tile)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setTimeoutAfter(90_000)
                .build()
        )
    }
}
