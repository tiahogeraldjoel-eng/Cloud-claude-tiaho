package com.tiaho.coffrefort.network

import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkUtils {

    /** Adresse IPv4 locale sur le réseau Wi-Fi/Hotspot courant, pour l'appairage P2P. */
    fun getLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return "127.0.0.1"
            for (intf in interfaces) {
                for (addr in intf.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress ?: continue
                    }
                }
            }
        } catch (e: Exception) {
            // Ignoré : on retombe sur le loopback ci-dessous.
        }
        return "127.0.0.1"
    }
}
