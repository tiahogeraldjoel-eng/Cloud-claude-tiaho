package com.joe.launcher.adapters

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.AppInfo

class DockAdapter(
    private val context: Context,
    private val onAppClick: (AppInfo) -> Unit
) : RecyclerView.Adapter<DockAdapter.DockViewHolder>() {

    private var apps = listOf<AppInfo>()

    fun updateApps(newApps: List<AppInfo>) {
        apps = newApps
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DockViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_dock_app, parent, false)
        return DockViewHolder(view)
    }

    override fun onBindViewHolder(holder: DockViewHolder, position: Int) {
        holder.bind(apps[position])
    }

    override fun getItemCount() = apps.size

    inner class DockViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivIcon: ImageView = itemView.findViewById(R.id.iv_dock_icon)

        fun bind(appInfo: AppInfo) {
            ivIcon.setImageDrawable(appInfo.icon)
            itemView.setOnClickListener { onAppClick(appInfo) }
        }
    }
}
