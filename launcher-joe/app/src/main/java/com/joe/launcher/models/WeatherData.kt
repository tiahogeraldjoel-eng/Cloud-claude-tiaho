package com.joe.launcher.models

data class WeatherData(
    val temperature: Double,          // °C
    val feelsLike: Double,            // °C
    val humidity: Int,                // %
    val windSpeed: Double,            // km/h
    val windDirection: Int,           // degrés
    val weatherCode: Int,             // WMO code
    val condition: String,            // libellé FR
    val conditionEmoji: String,       // emoji
    val cityName: String,
    val country: String,
    val latitude: Double,
    val longitude: Double,
    val isDay: Boolean,
    val uvIndex: Double = 0.0,
    val precipitation: Double = 0.0,  // mm
    val visibility: Double = 0.0,     // km
    val hourlyForecast: List<HourlyForecast> = emptyList(),
    val dailyForecast: List<DailyForecast> = emptyList(),
    val timestamp: Long = System.currentTimeMillis()
)

data class HourlyForecast(
    val hour: Int,
    val temperature: Double,
    val weatherCode: Int,
    val precipitation: Double,
    val emoji: String
)

data class DailyForecast(
    val dayName: String,
    val tempMin: Double,
    val tempMax: Double,
    val weatherCode: Int,
    val emoji: String,
    val precipitationSum: Double
)
