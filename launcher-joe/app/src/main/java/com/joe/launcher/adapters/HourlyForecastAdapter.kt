package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.HourlyForecast
import java.util.Calendar

class HourlyForecastAdapter(private val hours: List<HourlyForecast>) :
    RecyclerView.Adapter<HourlyForecastAdapter.HourVH>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        HourVH(LayoutInflater.from(parent.context).inflate(R.layout.item_hourly_forecast, parent, false))

    override fun onBindViewHolder(holder: HourVH, position: Int) = holder.bind(hours[position])
    override fun getItemCount() = hours.size

    inner class HourVH(view: View) : RecyclerView.ViewHolder(view) {
        private val tvHour: TextView = view.findViewById(R.id.tv_hour)
        private val tvEmoji: TextView = view.findViewById(R.id.tv_weather_emoji)
        private val tvTemp: TextView = view.findViewById(R.id.tv_temp)
        private val tvPrecip: TextView = view.findViewById(R.id.tv_precip_prob)

        fun bind(h: HourlyForecast) {
            val now = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
            tvHour.text = if (h.hour == now) "Maint." else "${h.hour}h"
            tvEmoji.text = h.emoji
            tvTemp.text = "${h.temperature.toInt()}°"
            tvPrecip.text = if (h.precipitation > 0) "${h.precipitation.toInt()}%" else ""
        }
    }
}
