package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.DailyForecast

class DailyForecastAdapter(private val days: List<DailyForecast>) :
    RecyclerView.Adapter<DailyForecastAdapter.DayVH>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        DayVH(LayoutInflater.from(parent.context).inflate(R.layout.item_daily_forecast, parent, false))

    override fun onBindViewHolder(holder: DayVH, position: Int) = holder.bind(days[position])
    override fun getItemCount() = days.size

    inner class DayVH(view: View) : RecyclerView.ViewHolder(view) {
        private val tvDay: TextView = view.findViewById(R.id.tv_day_name)
        private val tvEmoji: TextView = view.findViewById(R.id.tv_day_emoji)
        private val tvMin: TextView = view.findViewById(R.id.tv_temp_min)
        private val tvMax: TextView = view.findViewById(R.id.tv_temp_max)
        private val tvPrecip: TextView = view.findViewById(R.id.tv_day_precip)

        fun bind(d: DailyForecast) {
            tvDay.text = d.dayName.replaceFirstChar { it.uppercase() }
            tvEmoji.text = d.emoji
            tvMin.text = "${d.tempMin.toInt()}°"
            tvMax.text = "${d.tempMax.toInt()}°"
            tvPrecip.text = if (d.precipitationSum > 0) "${d.precipitationSum.toInt()} mm" else ""
        }
    }
}
