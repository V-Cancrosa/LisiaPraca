package pl.vcancrosa.lisiapraca

import android.content.Context
import android.graphics.Bitmap
import android.location.Location
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Zapisuje zrzut oferty, odczytuje z niego tekst (na telefonie, bez internetu) i odkłada ofertę dla aplikacji. */
object OfferProcessor {

    private val executor = Executors.newSingleThreadExecutor()
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    fun process(ctx: Context, bitmap: Bitmap, location: Location?) {
        val ts = System.currentTimeMillis()
        val id = "o" + ts.toString(36)
        executor.execute {
            // Mniejsza kopia do podglądu w aplikacji.
            runCatching {
                val w = 720
                val h = bitmap.height * w / bitmap.width
                val small = Bitmap.createScaledBitmap(bitmap, w, h, true)
                File(OfferStore.imageDir(ctx), "$id.jpg").outputStream().use {
                    small.compress(Bitmap.CompressFormat.JPEG, 72, it)
                }
            }

            val result = runCatching {
                Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 15, TimeUnit.SECONDS)
            }.getOrNull()

            val lines = JSONArray()
            result?.textBlocks?.forEach { block ->
                block.lines.forEach { line ->
                    val r = line.boundingBox
                    lines.put(
                        JSONObject()
                            .put("t", line.text)
                            .put("x", r?.left ?: 0)
                            .put("y", r?.top ?: 0)
                            .put("h", r?.height() ?: 0)
                    )
                }
            }
            val text = result?.text ?: ""

            val offer = JSONObject()
                .put("id", id)
                .put("ts", ts)
                .put("text", text)
                .put("lines", lines)
                .put("img", "$id.jpg")
                .put("w", bitmap.width)
                .put("h", bitmap.height)
            if (location != null) offer.put("lat", location.latitude).put("lng", location.longitude)

            OfferStore.addOffer(ctx, offer)
            Notify.offerSaved(ctx, text)
            MainActivity.instance?.push(JSONObject().put("event", "offer"))
            OfferStore.prune(ctx)
        }
    }
}
