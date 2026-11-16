package pl.vcancrosa.lisiapraca

import android.Manifest
import android.annotation.SuppressLint
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
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
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
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
        const val FLOATING_PREFS = "lisia_settings"
        const val FLOATING_ENABLED = "floating_enabled"
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
    private var floatingView: TextView? = null
    private var floatingManager: WindowManager? = null
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
        val hasLocation =
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
              checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

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
        syncFloatingView()
        OfferTileService.refresh(this)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeFloatingView()
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
        val priority = if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            Priority.PRIORITY_HIGH_ACCURACY
        } else {
            Priority.PRIORITY_BALANCED_POWER_ACCURACY
        }
        val req = LocationRequest.Builder(priority, 5000L)
            .setMinUpdateIntervalMillis(3000L)
            .build()
        client.requestLocationUpdates(req, cb, Looper.getMainLooper())
    }

    fun setFloatingEnabled(enabled: Boolean): Boolean {
        if (!enabled) {
            removeFloatingView()
            return true
        }
        if (!Settings.canDrawOverlays(this)) return false
        return showFloatingView()
    }

    fun resumeFloatingCapture() {
        floatingView?.visibility = View.VISIBLE
    }

    fun pauseFloatingCapture() {
        floatingView?.visibility = View.INVISIBLE
    }

    private fun syncFloatingView() {
        val enabled = getSharedPreferences(FLOATING_PREFS, MODE_PRIVATE)
            .getBoolean(FLOATING_ENABLED, false)
        setFloatingEnabled(enabled)
    }

    private fun showFloatingView(): Boolean {
        floatingView?.let {
            it.visibility = View.VISIBLE
            return true
        }
        val manager = getSystemService(WINDOW_SERVICE) as WindowManager
        val density = resources.displayMetrics.density
        val size = (56 * density).toInt()
        val params = WindowManager.LayoutParams(
            size,
            size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (resources.displayMetrics.widthPixels - size - (12 * density).toInt()).coerceAtLeast(0)
            y = (resources.displayMetrics.heightPixels - size) / 2
        }
        val bubble = TextView(this).apply {
            text = "📷"
            textSize = 25f
            gravity = Gravity.CENTER
            contentDescription = "Zrób zrzut oferty"
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.rgb(255, 140, 66))
                setStroke((2 * density).toInt(), Color.WHITE)
            }
            elevation = 8 * density
            setOnClickListener {
                visibility = View.INVISIBLE
                try {
                    startActivity(
                        Intent(this@ShiftService, CaptureActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (e: android.content.ActivityNotFoundException) {
                    visibility = View.VISIBLE
                    Toast.makeText(this@ShiftService, "Nie udało się otworzyć zrzutu", Toast.LENGTH_SHORT).show()
                } catch (e: SecurityException) {
                    visibility = View.VISIBLE
                    Toast.makeText(this@ShiftService, "Brak zgody na zrzut ekranu", Toast.LENGTH_SHORT).show()
                }
            }
        }
        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        var dragged = false
        bubble.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x
                    startY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    dragged = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).toInt()
                    val dy = (event.rawY - touchY).toInt()
                    if (kotlin.math.abs(dx) > touchSlop || kotlin.math.abs(dy) > touchSlop) dragged = true
                    if (dragged) {
                        params.x = (startX + dx).coerceIn(0, resources.displayMetrics.widthPixels - size)
                        params.y = (startY + dy).coerceIn(0, resources.displayMetrics.heightPixels - size)
                        manager.updateViewLayout(view, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragged) view.performClick()
                    true
                }
                else -> false
            }
        }
        return try {
            manager.addView(bubble, params)
            floatingView = bubble
            floatingManager = manager
            true
        } catch (e: SecurityException) {
            false
        }
    }

    private fun removeFloatingView() {
        val view = floatingView ?: return
        if (view.isAttachedToWindow) floatingManager?.removeViewImmediate(view)
        floatingView = null
        floatingManager = null
    }

    @SuppressLint("MissingPermission")
    fun currentAddress(callback: (JSONObject) -> Unit) {
        val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            callback(JSONObject().put("ok", false).put("reason", "location-permission-denied"))
            return
        }
        val priority = if (fine) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val client = fused ?: LocationServices.getFusedLocationProviderClient(this)
        client.getCurrentLocation(priority, CancellationTokenSource().token)
            .addOnSuccessListener { location ->
                if (location == null) {
                    callback(JSONObject().put("ok", false).put("reason", "location-unavailable"))
                    return@addOnSuccessListener
                }
                lastLocation = location
                Thread {
                    val result = JSONObject().put("ok", false)
                    try {
                        if (!Geocoder.isPresent()) throw IllegalStateException("geocoder-unavailable")
                        val geocoder = Geocoder(this, Locale.forLanguageTag("pl-PL"))
                        @Suppress("DEPRECATION")
                        val address = geocoder.getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull()
                        val label = address?.getAddressLine(0)?.trim().orEmpty()
                        if (label.isBlank()) throw IllegalStateException("address-not-found")
                        result.put("ok", true)
                            .put("label", label)
                            .put("lat", location.latitude)
                            .put("lng", location.longitude)
                            .put("accuracy", location.accuracy)
                    } catch (e: Exception) {
                        result.put("reason", e.message ?: "geocoding-failed")
                    }
                    main.post { callback(result) }
                }.start()
            }
            .addOnFailureListener { error ->
                callback(JSONObject().put("ok", false).put("reason", error.message ?: "location-failed"))
            }
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
