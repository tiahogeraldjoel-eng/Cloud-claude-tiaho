package com.joe.launcher.utils

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.joe.launcher.models.DailyForecast
import com.joe.launcher.models.HourlyForecast
import com.joe.launcher.models.WeatherData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

object WeatherFetcher {

    // Open-Meteo: modèles ECMWF + météo-france, sans clé API
    private const val BASE_URL = "https://api.open-meteo.com/v1/forecast"
    // Nominatim pour le nom de ville (OpenStreetMap)
    private const val GEO_URL = "https://nominatim.openstreetmap.org/reverse"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .addHeader("User-Agent", "LauncherJoe/1.0 Android")
                    .build()
            )
        }
        .build()

    suspend fun fetchWeather(latitude: Double, longitude: Double): WeatherData =
        withContext(Dispatchers.IO) {
            val url = buildWeatherUrl(latitude, longitude)
            val json = fetch(url)
            val cityName = fetchCityName(latitude, longitude)
            parseWeather(json, cityName, latitude, longitude)
        }

    private fun buildWeatherUrl(lat: Double, lon: Double): String {
        return "$BASE_URL?" +
            "latitude=$lat" +
            "&longitude=$lon" +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m," +
            "precipitation,weather_code,wind_speed_10m,wind_direction_10m," +
            "is_day,uv_index,visibility" +
            "&hourly=temperature_2m,precipitation_probability,weather_code" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum," +
            "sunrise,sunset" +
            "&timezone=auto" +
            "&forecast_days=7" +
            "&models=best_match"   // Open-Meteo choisit automatiquement le meilleur modèle
    }

    private fun fetch(url: String): JsonObject {
        val request = Request.Builder().url(url).get().build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
        val body = response.body?.string() ?: throw Exception("Réponse vide")
        return JsonParser.parseString(body).asJsonObject
    }

    private fun fetchCityName(lat: Double, lon: Double): Pair<String, String> {
        return try {
            val url = "$GEO_URL?lat=$lat&lon=$lon&format=json&accept-language=fr"
            val request = Request.Builder().url(url).get().build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: return Pair("", "")
            val json = JsonParser.parseString(body).asJsonObject
            val address = json.getAsJsonObject("address")
            val city = address?.get("city")?.asString
                ?: address?.get("town")?.asString
                ?: address?.get("village")?.asString
                ?: address?.get("municipality")?.asString
                ?: "Localisation"
            val country = address?.get("country_code")?.asString?.uppercase() ?: ""
            Pair(city, country)
        } catch (e: Exception) {
            Pair("Localisation", "")
        }
    }

    private fun parseWeather(
        json: JsonObject,
        location: Pair<String, String>,
        lat: Double,
        lon: Double
    ): WeatherData {
        val current = json.getAsJsonObject("current")
        val hourly = json.getAsJsonObject("hourly")
        val daily = json.getAsJsonObject("daily")

        val code = current.get("weather_code").asInt
        val isDay = current.get("is_day").asInt == 1
        val temp = current.get("temperature_2m").asDouble
        val feelsLike = current.get("apparent_temperature").asDouble
        val humidity = current.get("relative_humidity_2m").asInt
        val wind = current.get("wind_speed_10m").asDouble
        val windDir = current.get("wind_direction_10m").asInt
        val precip = safeDouble(current, "precipitation")
        val uv = safeDouble(current, "uv_index")
        val visibility = safeDouble(current, "visibility") / 1000.0 // m → km

        // Prévisions horaires (24h)
        val hourlyTemps = hourly.getAsJsonArray("temperature_2m")
        val hourlyCodes = hourly.getAsJsonArray("weather_code")
        val hourlyPrecip = hourly.getAsJsonArray("precipitation_probability")

        val hourlyForecast = (0 until minOf(24, hourlyTemps.size())).map { i ->
            HourlyForecast(
                hour = i,
                temperature = hourlyTemps[i].asDouble,
                weatherCode = hourlyCodes[i].asInt,
                precipitation = hourlyPrecip?.get(i)?.asDouble ?: 0.0,
                emoji = wmoEmoji(hourlyCodes[i].asInt, true)
            )
        }

        // Prévisions 7 jours
        val dailyCodes = daily.getAsJsonArray("weather_code")
        val dailyMax = daily.getAsJsonArray("temperature_2m_max")
        val dailyMin = daily.getAsJsonArray("temperature_2m_min")
        val dailyPrecip = daily.getAsJsonArray("precipitation_sum")

        val dayNames = listOf("Aujourd'hui", "Demain", "Après-demain") +
            (3..6).map { getDayName(it) }

        val dailyForecast = (0 until minOf(7, dailyCodes.size())).map { i ->
            DailyForecast(
                dayName = dayNames.getOrElse(i) { "J+$i" },
                tempMin = dailyMin[i].asDouble,
                tempMax = dailyMax[i].asDouble,
                weatherCode = dailyCodes[i].asInt,
                emoji = wmoEmoji(dailyCodes[i].asInt, true),
                precipitationSum = dailyPrecip?.get(i)?.asDouble ?: 0.0
            )
        }

        return WeatherData(
            temperature = temp,
            feelsLike = feelsLike,
            humidity = humidity,
            windSpeed = wind,
            windDirection = windDir,
            weatherCode = code,
            condition = wmoCondition(code),
            conditionEmoji = wmoEmoji(code, isDay),
            cityName = location.first,
            country = location.second,
            latitude = lat,
            longitude = lon,
            isDay = isDay,
            uvIndex = uv,
            precipitation = precip,
            visibility = visibility,
            hourlyForecast = hourlyForecast,
            dailyForecast = dailyForecast
        )
    }

    private fun safeDouble(obj: JsonObject, key: String): Double =
        try { obj.get(key)?.asDouble ?: 0.0 } catch (e: Exception) { 0.0 }

    private fun getDayName(offset: Int): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, offset)
        return cal.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.LONG, Locale.FRENCH) ?: "J+$offset"
    }

    // WMO Weather interpretation codes → emoji
    fun wmoEmoji(code: Int, isDay: Boolean): String = when (code) {
        0 -> if (isDay) "☀️" else "🌙"
        1 -> if (isDay) "🌤️" else "🌙"
        2 -> "⛅"
        3 -> "☁️"
        45, 48 -> "🌫️"
        51, 53 -> "🌦️"
        55 -> "🌧️"
        56, 57 -> "🌨️"
        61, 63 -> "🌧️"
        65 -> "🌧️"
        66, 67 -> "🌨️"
        71, 73 -> "🌨️"
        75 -> "❄️"
        77 -> "🌨️"
        80, 81 -> "🌦️"
        82 -> "⛈️"
        85, 86 -> "🌨️"
        95 -> "⛈️"
        96, 99 -> "⛈️"
        else -> "🌡️"
    }

    // WMO codes → libellé français
    fun wmoCondition(code: Int): String = when (code) {
        0 -> "Ciel dégagé"
        1 -> "Principalement dégagé"
        2 -> "Partiellement nuageux"
        3 -> "Couvert"
        45 -> "Brouillard"
        48 -> "Brouillard givrant"
        51 -> "Bruine légère"
        53 -> "Bruine modérée"
        55 -> "Bruine dense"
        56 -> "Bruine verglaçante légère"
        57 -> "Bruine verglaçante dense"
        61 -> "Pluie légère"
        63 -> "Pluie modérée"
        65 -> "Pluie forte"
        66 -> "Pluie verglaçante légère"
        67 -> "Pluie verglaçante forte"
        71 -> "Neige légère"
        73 -> "Neige modérée"
        75 -> "Neige forte"
        77 -> "Grains de neige"
        80 -> "Averses légères"
        81 -> "Averses modérées"
        82 -> "Averses violentes"
        85 -> "Averses de neige légères"
        86 -> "Averses de neige fortes"
        95 -> "Orage"
        96 -> "Orage avec grêle légère"
        99 -> "Orage avec grêle forte"
        else -> "Conditions variables"
    }

    // Direction vent → symbole
    fun windDirectionLabel(degrees: Int): String {
        val dirs = arrayOf("N", "NE", "E", "SE", "S", "SO", "O", "NO")
        return dirs[((degrees + 22.5) / 45).toInt() % 8]
    }
}
