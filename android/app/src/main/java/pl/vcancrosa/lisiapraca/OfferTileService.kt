package pl.vcancrosa.lisiapraca

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Kafelek „Nowy kurs” w panelu szybkich ustawień. */
class OfferTileService : TileService() {

    companion object {
        fun refresh(ctx: Context) {
            runCatching { TileService.requestListeningState(ctx, ComponentName(ctx, OfferTileService::class.java)) }
        }
    }

    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile ?: return
        val on = ShiftService.isCapturing()
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "Nowy kurs"
        tile.subtitle = if (on) "Zrzut oferty" else "Włącz w aplikacji"
        tile.updateTile()
    }

    override fun onClick() {
        super.onClick()
        val capturing = ShiftService.isCapturing()
        val intent = if (capturing) {
            Intent(this, CaptureActivity::class.java)
        } else {
            Intent(this, MainActivity::class.java).putExtra("needCapture", true)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            val pi = PendingIntent.getActivity(
                this, if (capturing) 1 else 2, intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            startActivityAndCollapse(pi)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
