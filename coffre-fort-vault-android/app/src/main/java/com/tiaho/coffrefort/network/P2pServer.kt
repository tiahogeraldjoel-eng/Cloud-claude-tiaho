package com.tiaho.coffrefort.network

import java.io.IOException
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * Serveur réseau local hors-ligne pour recevoir du texte/documents via Wi-Fi/Hotspot,
 * sans passer par Internet.
 */
class P2pServer(private val port: Int = 5000) {
    @Volatile private var running = false
    private var serverSocket: ServerSocket? = null

    fun start(onReceive: (String) -> Unit) {
        if (running) return
        running = true
        thread(isDaemon = true) {
            try {
                val socket = ServerSocket(port)
                serverSocket = socket
                while (running) {
                    val client = socket.accept()
                    val data = client.getInputStream().bufferedReader().readText()
                    if (data.isNotEmpty()) onReceive(data)
                    client.close()
                }
            } catch (e: IOException) {
                // Le socket a été fermé par stop() ; sortie normale de la boucle.
            }
        }
    }

    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (e: IOException) {
            // Déjà fermé.
        }
    }
}
