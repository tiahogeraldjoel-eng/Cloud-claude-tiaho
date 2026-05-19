package com.joe.launcher.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.joe.launcher.R
import com.joe.launcher.models.AppInfo
import com.joe.launcher.utils.PrefsManager

class AppGridAdapter(
    private val onAppClick: (AppInfo) -> Unit,
    private val onAppLongClick: (AppInfo) -> Unit
) : ListAdapter<AppInfo, AppGridAdapter.AppViewHolder>(APP_DIFF) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app_grid, parent, false)
        return AppViewHolder(view)
    }

    override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
        holder.bind(getItem(position))
        holder.itemView.startAnimation(
            AnimationUtils.loadAnimation(holder.itemView.context, R.anim.item_appear)
        )
    }

    inner class AppViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivIcon: ImageView = itemView.findViewById(R.id.iv_app_icon)
        private val tvLabel: TextView = itemView.findViewById(R.id.tv_app_label)

        fun bind(appInfo: AppInfo) {
            ivIcon.setImageDrawable(appInfo.icon)
            tvLabel.text = appInfo.label

            tvLabel.visibility = if (PrefsManager.showAppLabels()) View.VISIBLE else View.GONE

            itemView.setOnClickListener {
                it.startAnimation(AnimationUtils.loadAnimation(it.context, R.anim.scale_bounce))
                onAppClick(appInfo)
            }

            itemView.setOnLongClickListener {
                onAppLongClick(appInfo)
                true
            }
        }
    }

    companion object {
        val APP_DIFF = object : DiffUtil.ItemCallback<AppInfo>() {
            override fun areItemsTheSame(old: AppInfo, new: AppInfo) =
                old.packageName == new.packageName
            override fun areContentsTheSame(old: AppInfo, new: AppInfo) =
                old.packageName == new.packageName && old.label == new.label
        }
    }
}
