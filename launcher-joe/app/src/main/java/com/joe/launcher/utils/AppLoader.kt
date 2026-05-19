package com.joe.launcher.utils

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.joe.launcher.models.AppInfo

object AppLoader {

    fun getAllInstalledApps(context: Context): List<AppInfo> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        return pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .filter { it.activityInfo.packageName != context.packageName }
            .map { resolveInfo ->
                AppInfo(
                    packageName = resolveInfo.activityInfo.packageName,
                    label = resolveInfo.loadLabel(pm),
                    icon = resolveInfo.loadIcon(pm),
                    activityName = resolveInfo.activityInfo.name
                )
            }
    }

    fun getAppsFromPackages(context: Context, packages: List<String>): List<AppInfo> {
        val pm = context.packageManager
        return packages.mapNotNull { pkg ->
            try {
                val appInfo = pm.getApplicationInfo(pkg, 0)
                AppInfo(
                    packageName = pkg,
                    label = pm.getApplicationLabel(appInfo),
                    icon = pm.getApplicationIcon(appInfo)
                )
            } catch (e: PackageManager.NameNotFoundException) {
                null
            }
        }
    }

    fun getDefaultDockApps(context: Context): List<AppInfo> {
        val defaultPackages = listOf(
            "com.android.dialer",
            "com.android.contacts",
            "com.android.messaging",
            "com.android.chrome",
            "com.google.android.apps.photos"
        )
        val available = getAppsFromPackages(context, defaultPackages)

        // Compléter avec d'autres apps si pas assez
        if (available.size < 5) {
            val allApps = getAllInstalledApps(context).take(5 - available.size)
            return available + allApps
        }
        return available.take(5)
    }
}
