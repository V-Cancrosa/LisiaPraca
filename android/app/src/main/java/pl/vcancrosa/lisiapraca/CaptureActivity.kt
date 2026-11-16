package pl.vcancrosa.lisiapraca

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast

/**
 * Przezroczysty ekran uruchamiany z kafelka. Czeka, aż panel szybkich ustawień się schowa,
 * robi zrzut tego, co widać pod spodem (oferta Ubera), i od razu się zamyka.
 */
class CaptureActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ShiftService.instance?.pauseFloatingCapture()
        Handler(Looper.getMainLooper()).postDelayed({ grab() }, 550)
    }

    private fun grab() {
        val svc = ShiftService.instance
        val bitmap = svc?.capture()
        svc?.resumeFloatingCapture()
        if (bitmap == null) {
            if (!ShiftService.isCapturing()) {
                startActivity(
                    Intent(this, MainActivity::class.java)
                        .putExtra("needCapture", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } else {
                Toast.makeText(this, "Nie udało się zrobić zrzutu", Toast.LENGTH_SHORT).show()
            }
            finish()
            return
        }
        val location = svc.lastLocation
        val app = applicationContext
        finish()
        OfferProcessor.process(app, bitmap, location)
    }
}
