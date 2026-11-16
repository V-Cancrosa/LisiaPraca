package pl.vcancrosa.lisiapraca

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Kolejka ofert i zdarzeń czekających, aż strona je odbierze (np. gdy aplikacja była zamknięta). */
object OfferStore {

    private const val PREFS = "lisia_offers"

    fun imageDir(ctx: Context): File = File(ctx.filesDir, "offers").apply { mkdirs() }

    fun addOffer(ctx: Context, o: JSONObject) = append(ctx, "offers", o)
    fun addEvent(ctx: Context, o: JSONObject) = append(ctx, "events", o)
    fun takeOffers(ctx: Context): JSONArray = take(ctx, "offers")
    fun takeEvents(ctx: Context): JSONArray = take(ctx, "events")

    @Synchronized
    private fun append(ctx: Context, key: String, o: JSONObject) {
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = runCatching { JSONArray(sp.getString(key, "[]")) }.getOrDefault(JSONArray())
        arr.put(o)
        sp.edit().putString(key, arr.toString()).commit()
    }

    @Synchronized
    private fun take(ctx: Context, key: String): JSONArray {
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = runCatching { JSONArray(sp.getString(key, "[]")) }.getOrDefault(JSONArray())
        sp.edit().putString(key, "[]").commit()
        return arr
    }

    /** Zostawia 300 najnowszych zrzutów. */
    fun prune(ctx: Context) {
        val files = imageDir(ctx).listFiles()?.sortedByDescending { it.lastModified() } ?: return
        files.drop(300).forEach { it.delete() }
    }
}
