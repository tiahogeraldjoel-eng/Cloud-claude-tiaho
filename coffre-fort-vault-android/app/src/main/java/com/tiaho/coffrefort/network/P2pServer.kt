package com.tiaho.coffrefort.network

import java.io.DataInputStream
import java.io.IOException
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * Serveur réseau local hors-ligne pour recevoir des documents via Wi-Fi/Hotspot,
 * sans passer par Internet. Le protocole est en clair (réseau local de confiance
 * uniquement) : titre, catégorie, puis les octets du fichier, chacun préfixé par
 * sa longueur — symétrique de [P2pClient].
 */
class P2pServer(private val port: Int = DEFAULT_PORT) {
    @Volatile private var running = false
    private var serverSocket: ServerSocket? = null

    fun start(onReceive: (title: String, category: String, data: ByteArray) -> Unit) {
        if (running) return
        running = true
        thread(isDaemon = true) {
            try {
                val socket = ServerSocket(port)
                serverSocket = socket
                while (running) {
                    val client = socket.accept()
                    try {
                        val input = DataInputStream(client.getInputStream())
                        val title = input.readUTF()
                        val category = input.readUTF()
                        val length = input.readInt()
                        val data = ByteArray(length)
                        input.readFully(data)
                        onReceive(title, category, data)
                    } catch (e: IOException) {
                        // Transfert interrompu ou mal formé : ignoré.
                    } finally {
                        client.close()
                    }
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

    companion object {
        const val DEFAULT_PORT = 5000
    }
}
