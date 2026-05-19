package com.joe.launcher.utils

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

object LocationHelper {

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED

    suspend fun getCurrentLocation(context: Context): Location =
        suspendCancellableCoroutine { cont ->
            val fusedClient = LocationServices.getFusedLocationProviderClient(context)
            val cts = CancellationTokenSource()

            cont.invokeOnCancellation { cts.cancel() }

            try {
                fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                    .addOnSuccessListener { location ->
                        if (location != null) {
                            cont.resume(location)
                        } else {
                            // Fallback: dernière position connue
                            fusedClient.lastLocation
                                .addOnSuccessListener { last ->
                                    if (last != null) cont.resume(last)
                                    else cont.resumeWithException(Exception("Position indisponible"))
                                }
                                .addOnFailureListener { cont.resumeWithException(it) }
                        }
                    }
                    .addOnFailureListener { cont.resumeWithException(it) }
            } catch (e: SecurityException) {
                cont.resumeWithException(e)
            }
        }

    // Utilise la dernière position sauvegardée si disponible
    fun getSavedLocation(context: Context): Pair<Double, Double>? {
        val prefs = context.getSharedPreferences("launcher_joe_prefs", Context.MODE_PRIVATE)
        val lat = prefs.getFloat("weather_lat", Float.MIN_VALUE)
        val lon = prefs.getFloat("weather_lon", Float.MIN_VALUE)
        return if (lat != Float.MIN_VALUE && lon != Float.MIN_VALUE)
            Pair(lat.toDouble(), lon.toDouble())
        else null
    }

    fun saveLocation(context: Context, lat: Double, lon: Double) {
        context.getSharedPreferences("launcher_joe_prefs", Context.MODE_PRIVATE)
            .edit()
            .putFloat("weather_lat", lat.toFloat())
            .putFloat("weather_lon", lon.toFloat())
            .apply()
    }
}
