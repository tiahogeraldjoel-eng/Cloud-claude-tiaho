package com.joe.launcher.models

import android.graphics.drawable.Drawable

data class AppInfo(
    val packageName: String,
    val label: CharSequence,
    val icon: Drawable,
    val activityName: String = "",
    var isInDock: Boolean = false,
    var dockPosition: Int = -1
)
