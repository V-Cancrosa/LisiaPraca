package pl.vcancrosa.lisiapraca

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File

/**
 * Główny ekran: WebView z aplikacją z GitHub Pages (ta sama co PWA) plus most do funkcji telefonu.
 * Strona rozmawia z aplikacją przez obiekt `LisiaNative` (postMessage, tylko z naszej domeny).
 */
class MainActivity : Activity() {

    companion object {
        @Volatile
        var instance: MainActivity? = null
        const val ORIGIN = "https://v-cancrosa.github.io"
        const val START_URL = "$ORIGIN/LisiaPraca/?app=1"
        private const val REQ_CAPTURE = 10
        private const val REQ_PERMS = 11
        private const val REQ_FILE = 12
    }

    private lateinit var web: WebView
    private var proxy: JavaScriptReplyProxy? = null
    private var pendingCaptureId: Int? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        Notify.channels(this)

        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.host == "v-cancrosa.github.io" && u.path?.contains("/__native/offer/") == true) {
                    val name = u.lastPathSegment ?: return null
                    if (!name.matches(Regex("[a-z0-9]+\\.jpg"))) return null
                    val f = File(OfferStore.imageDir(this@MainActivity), name)
                    if (f.exists()) return WebResourceResponse("image/jpeg", null, f.inputStream())
                }
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "v-cancrosa.github.io") return false
                // Linki zewnętrzne (np. GitHub) otwieramy w przeglądarce.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "LisiaNative", setOf(ORIGIN)) { _, message, _, isMainFrame, replyProxy ->
                if (isMainFrame) {
                    proxy = replyProxy
                    message.data?.let { handle(it) }
                }
            }
        } else {
            Toast.makeText(this, "Zaktualizuj Android System WebView, żeby działał kafelek.", Toast.LENGTH_LONG).show()
        }

        web.loadUrl(START_URL)
        handleIntent(intent)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(i: Intent?) {
        if (i == null) return
        if (i.getBooleanExtra("needCapture", false)) {
            i.removeExtra("needCapture")
            // Strona może jeszcze się ładować – daj jej chwilę.
            main.postDelayed({ push(JSONObject().put("event", "needCapture")) }, 1500)
        }
        if (i.getBooleanExtra("arrived", false)) {
            i.removeExtra("arrived")
            main.postDelayed({ push(JSONObject().put("event", "sync")) }, 800)
        }
    }

    /** Wysyła wiadomość do strony (zdarzenie albo odpowiedź). */
    fun push(o: JSONObject) {
        main.post { runCatching { proxy?.postMessage(o.toString()) } }
    }

    private fun reply(id: Int, result: Any?) {
        push(JSONObject().put("id", id).put("result", result ?: JSONObject.NULL))
    }

    private fun status(): JSONObject {
        val version = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: ""
        return JSONObject()
            .put("capturing", ShiftService.isCapturing())
            .put("service", ShiftService.instance != null)
            .put("version", version)
    }

    private fun handle(json: String) {
        val m = runCatching { JSONObject(json) }.getOrNull() ?: return
        val id = m.optInt("id")
        val args = m.optJSONObject("args") ?: JSONObject()
        when (m.optString("cmd")) {
            "hello" -> reply(id, status())
            "startCapture" -> {
                pendingCaptureId = id
                ensurePermissionsThenConsent()
            }
            "stopShift" -> {
                stopService(Intent(this, ShiftService::class.java))
                main.postDelayed({ reply(id, status()) }, 300)
            }
            "take" -> reply(
                id,
                JSONObject().put("offers", OfferStore.takeOffers(this)).put("events", OfferStore.takeEvents(this))
            )
            "watchPickup" -> {
                val svc = ShiftService.instance
                if (svc == null) reply(id, JSONObject().put("ok", false).put("reason", "no-service"))
                else svc.setTarget(args.optString("rideId"), args.optString("query")) { reply(id, it) }
            }
            "clearPickup" -> {
                ShiftService.instance?.clearTarget()
                reply(id, true)
            }
            "shareFile" -> reply(id, share(args))
            else -> reply(id, JSONObject.NULL)
        }
    }

    private fun ensurePermissionsThenConsent() {
        val needed = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isNotEmpty()) requestPermissions(needed.toTypedArray(), REQ_PERMS)
        else launchConsent()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERMS) launchConsent()
    }

    private fun launchConsent() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val intent = if (Build.VERSION.SDK_INT >= 34) {
            // Od razu cały ekran (bez wyboru jednej aplikacji).
            mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
            mpm.createScreenCaptureIntent()
        }
        try {
            startActivityForResult(intent, REQ_CAPTURE)
        } catch (e: Exception) {
            startShiftService(null, 0)
        }
    }

    private fun startShiftService(data: Intent?, code: Int) {
        val i = Intent(this, ShiftService::class.java)
        if (data != null) i.putExtra("code", code).putExtra("data", data)
        runCatching { startForegroundService(i) }
        val id = pendingCaptureId
        pendingCaptureId = null
        if (id != null) main.postDelayed({ reply(id, status()) }, 900)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_CAPTURE -> {
                if (resultCode == RESULT_OK && data != null) startShiftService(data, resultCode)
                else startShiftService(null, 0) // bez zrzutów, ale GPS dalej działa
            }
            REQ_FILE -> {
                fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
                fileCallback = null
            }
        }
    }

    /** Udostępnia plik (CSV, kopia zapasowa) przez systemowe menu „Udostępnij”. */
    private fun share(args: JSONObject): Boolean {
        val name = args.optString("name").replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "plik.txt" }
        val mime = args.optString("mime").ifEmpty { "text/plain" }
        return try {
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val f = File(dir, name)
            f.writeText(args.optString("text"))
            val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
            val send = Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(send, name))
            true
        } catch (e: Exception) {
            false
        }
    }
}
