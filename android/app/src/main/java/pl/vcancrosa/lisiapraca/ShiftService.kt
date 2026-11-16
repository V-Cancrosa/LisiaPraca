package pl.vcancrosa.lisiapraca

import android.Manifest
import android.annotation.SuppressLint
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.location.Geocoder
import android.location.Location
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.view.WindowManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.util.Locale

/**
 * Usługa działająca w czasie zmiany:
 * - trzyma podgląd ekranu (MediaProjection), żeby kafelek mógł od razu zrobić zrzut oferty,
 * - śledzi GPS i daje znać, gdy dojedziesz do miejsca odbioru.
 */
class ShiftService : Service() {

    companion object {
        @Volatile
        var instance: ShiftService? = null
        fun isCapturing() = instance?.projection != null
        private const val ARRIVAL_METERS = 150f
    }

    @Volatile
    var projection: MediaProjection? = null
        private set
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var captureThread: HandlerThread? = null
    private val frameLock = Any()
    private var latest: Image? = null

    private var fused: FusedLocationProviderClient? = null
    private var locationCallback: LocationCallback? = null
    @Volatile
    var lastLocation: Location? = null
        private set
    private var target: Location? = null
    private var targetRide: String? = null
    private var arrivedSent = false
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        Notify.channels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
            intent?.getParcelableExtra("data", Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent?.getParcelableExtra("data")
        }
        val code = intent?.getIntExtra("code", 0) ?: 0
        val hasLocation = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

        var type = 0
        if (data != null || projection != null) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        if (hasLocation) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        if (type == 0) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            startForeground(Notify.ONGOING_ID, Notify.ongoing(this, data != null || projection != null), type)
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (data != null) startProjection(code, data)
        if (hasLocation) startLocation()
        OfferTileService.refresh(this)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopProjection()
        locationCallback?.let { fused?.removeLocationUpdates(it) }
        locationCallback = null
        instance = null
        OfferTileService.refresh(this)
        MainActivity.instance?.push(JSONObject().put("event", "capture").put("on", false))
        super.onDestroy()
    }

    /* ---------------- Zrzuty ekranu ---------------- */

    private fun startProjection(code: Int, data: Intent) {
        stopProjection()
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val p = try { mpm.getMediaProjection(code, data) } catch (e: Exception) { null } ?: return

        val thread = HandlerThread("lisia-capture").also { it.start() }
        captureThread = thread
        val handler = Handler(thread.looper)

        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                main.post {
                    if (projection === p) {
                        stopProjection()
                        Notify.updateOngoing(this@ShiftService, false)
                        OfferTileService.refresh(this@ShiftService)
                        MainActivity.instance?.push(JSONObject().put("event", "capture").put("on", false))
                    }
                }
            }
        }, handler)

        val bounds = getSystemService(WindowManager::class.java).maximumWindowMetrics.bounds
        val width = bounds.width()
        val height = bounds.height()
        val dpi = resources.displayMetrics.densityDpi

        val r = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        r.setOnImageAvailableListener({ ir ->
            val img = try { ir.acquireLatestImage() } catch (e: Exception) { null }
            if (img != null) synchronized(frameLock) {
                latest?.close()
                latest = img
            }
        }, handler)
        reader = r

        virtualDisplay = p.createVirtualDisplay(
            "lisia-praca", width, height, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler
        )
        projection = p
        Notify.updateOngoing(this, true)
        MainActivity.instance?.push(JSONObject().put("event", "capture").put("on", true))
    }

    private fun stopProjection() {
        val p = projection
        projection = null
        virtualDisplay?.release()
        virtualDisplay = null
        synchronized(frameLock) {
            latest?.close()
            latest = null
        }
        reader?.close()
        reader = null
        runCatching { p?.stop() }
        captureThread?.quitSafely()
        captureThread = null
    }

    /** Ostatnia klatka ekranu jako bitmapa (null, jeśli przechwytywanie nie działa). */
    fun capture(): Bitmap? = synchronized(frameLock) {
        val img = latest ?: return null
        val plane = img.planes[0]
        val buffer = plane.buffer
        buffer.rewind()
        val pixelStride = plane.pixelStride
        val rowPadding = plane.rowStride - pixelStride * img.width
        val padded = Bitmap.createBitmap(img.width + rowPadding / pixelStride, img.height, Bitmap.Config.ARGB_8888)
        padded.copyPixelsFromBuffer(buffer)
        if (rowPadding == 0) padded else Bitmap.createBitmap(padded, 0, 0, img.width, img.height)
    }

    /* ---------------- GPS i dojazd do klienta ---------------- */

    @SuppressLint("MissingPermission")
    private fun startLocation() {
        if (locationCallback != null) return
        val client = LocationServices.getFusedLocationProviderClient(this)
        fused = client
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val l = result.lastLocation ?: return
                lastLocation = l
                checkArrival(l)
            }
        }
        locationCallback = cb
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateIntervalMillis(3000L)
            .build()
        client.requestLocationUpdates(req, cb, Looper.getMainLooper())
    }

    private fun checkArrival(l: Location) {
        val t = target ?: return
        val ride = targetRide ?: return
        if (arrivedSent || l.distanceTo(t) > ARRIVAL_METERS) return
        arrivedSent = true
        OfferStore.addEvent(
            this,
            JSONObject().put("type", "arrived").put("rideId", ride).put("ts", System.currentTimeMillis())
        )
        Notify.arrived(this)
        MainActivity.instance?.push(JSONObject().put("event", "sync"))
    }

    /** Szuka adresu odbioru (przybliżonego, z oferty) w pobliżu i od tej chwili czeka na dojazd. */
    fun setTarget(rideId: String, query: String, callback: (JSONObject) -> Unit) {
        val near = lastLocation
        Thread {
            val res = JSONObject().put("ok", false)
            try {
                if (Geocoder.isPresent() && query.isNotBlank()) {
                    val g = Geocoder(this, Locale.forLanguageTag("pl-PL"))
                    @Suppress("DEPRECATION")
                    val list = if (near != null) {
                        g.getFromLocationName(
                            query, 5,
                            near.latitude - 0.3, near.longitude - 0.45,
                            near.latitude + 0.3, near.longitude + 0.45
                        )
                    } else {
                        g.getFromLocationName(query, 5)
                    }
                    val best = list?.minByOrNull { a ->
                        if (near == null) 0f else {
                            val d = FloatArray(1)
                            Location.distanceBetween(near.latitude, near.longitude, a.latitude, a.longitude, d)
                            d[0]
                        }
                    }
                    if (best != null) {
                        val loc = Location("geocoder").apply {
                            latitude = best.latitude
                            longitude = best.longitude
                        }
                        main.post {
                            target = loc
                            targetRide = rideId
                            arrivedSent = false
                        }
                        res.put("ok", true)
                            .put("lat", best.latitude)
                            .put("lng", best.longitude)
                            .put("label", best.getAddressLine(0) ?: query)
                    } else {
                        res.put("reason", "not-found")
                    }
                }
            } catch (e: Exception) {
                res.put("reason", e.message ?: "error")
            }
            main.post { callback(res) }
        }.start()
    }

    fun clearTarget() {
        target = null
        targetRide = null
        arrivedSent = false
    }
}
