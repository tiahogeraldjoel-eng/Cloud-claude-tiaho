package com.tiaho.coffrefort.network

import java.io.DataOutputStream
import java.net.Socket

/** Envoie un document à un pair sur le réseau local, symétrique de [P2pServer]. */
object P2pClient {

    fun send(host: String, port: Int, title: String, category: String, data: ByteArray) {
        Socket(host, port).use { socket ->
            socket.soTimeout = 10_000
            val output = DataOutputStream(socket.getOutputStream())
            output.writeUTF(title)
            output.writeUTF(category)
            output.writeInt(data.size)
            output.write(data)
            output.flush()
        }
    }
}
