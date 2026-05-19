package com.joe.launcher.activities

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.adapters.HourlyForecastAdapter
import com.joe.launcher.adapters.DailyForecastAdapter
import com.joe.launcher.databinding.ActivityWeatherBinding
import com.joe.launcher.models.WeatherData
import com.joe.launcher.utils.LocationHelper
import com.joe.launcher.utils.WeatherFetcher
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class WeatherActivity : AppCompatActivity() {

    private lateinit var binding: ActivityWeatherBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWeatherBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.btnRefresh.setOnClickListener { loadWeather() }

        loadWeather()
    }

    private fun loadWeather() {
        binding.progressBar.visibility = View.VISIBLE
        binding.layoutContent.visibility = View.GONE
        binding.layoutError.visibility = View.GONE

        if (!LocationHelper.hasPermission(this)) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                300
            )
            return
        }

        lifecycleScope.launch {
            try {
                val location = try {
                    LocationHelper.getCurrentLocation(this@WeatherActivity).also {
                        LocationHelper.saveLocation(this@WeatherActivity, it.latitude, it.longitude)
                    }
                } catch (e: Exception) {
                    // Utiliser dernière position connue
                    val saved = LocationHelper.getSavedLocation(this@WeatherActivity)
                    if (saved != null) {
                        android.location.Location("saved").apply {
                            latitude = saved.first; longitude = saved.second
                        }
                    } else throw e
                }

                val weather = WeatherFetcher.fetchWeather(location.latitude, location.longitude)

                binding.progressBar.visibility = View.GONE
                binding.layoutContent.visibility = View.VISIBLE
                displayWeather(weather)

            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.layoutError.visibility = View.VISIBLE
                binding.tvError.text = "Impossible de récupérer la météo:\n${e.message}"
            }
        }
    }

    private fun displayWeather(w: WeatherData) {
        // Header
        binding.tvCity.text = w.cityName
        binding.tvCountry.text = w.country
        binding.tvEmoji.text = w.conditionEmoji
        binding.tvTemperature.text = "${w.temperature.toInt()}°C"
        binding.tvCondition.text = w.condition
        binding.tvFeelsLike.text = "Ressenti ${w.feelsLike.toInt()}°C"

        // Détails
        binding.tvHumidity.text = "${w.humidity}%"
        binding.tvWind.text = "${w.windSpeed.toInt()} km/h ${WeatherFetcher.windDirectionLabel(w.windDirection)}"
        binding.tvPrecipitation.text = "${w.precipitation} mm"
        binding.tvVisibility.text = "${String.format("%.1f", w.visibility)} km"
        binding.tvUvIndex.text = uvLabel(w.uvIndex)

        // Dernière mise à jour
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        binding.tvLastUpdate.text = "Mis à jour à ${sdf.format(Date(w.timestamp))}"
        binding.tvSource.text = "Source: Open-Meteo (ECMWF)"

        // Prévisions horaires
        binding.rvHourly.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.rvHourly.adapter = HourlyForecastAdapter(w.hourlyForecast)

        // Prévisions 7 jours
        binding.rvDaily.layoutManager = LinearLayoutManager(this)
        binding.rvDaily.adapter = DailyForecastAdapter(w.dailyForecast)
    }

    private fun uvLabel(uv: Double): String = when {
        uv < 3 -> "${uv.toInt()} Faible"
        uv < 6 -> "${uv.toInt()} Modéré"
        uv < 8 -> "${uv.toInt()} Élevé"
        uv < 11 -> "${uv.toInt()} Très élevé"
        else -> "${uv.toInt()} Extrême"
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 300 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            loadWeather()
        } else {
            binding.progressBar.visibility = View.GONE
            binding.layoutError.visibility = View.VISIBLE
            binding.tvError.text = "Permission de localisation refusée.\nActivez-la dans les paramètres Android."
        }
    }
}
