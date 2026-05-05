package com.brvm.alerte.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.SmsManager
import android.widget.Toast

object ShareHelper {

    fun shareToWhatsApp(context: Context, message: String) {
        val plainText = stripMarkdown(message)
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                setPackage("com.whatsapp")
                putExtra(Intent.EXTRA_TEXT, plainText)
            }
            context.startActivity(Intent.createChooser(intent, "Partager via WhatsApp"))
        } catch (e: Exception) {
            // WhatsApp non installé — partage générique
            shareGeneric(context, plainText)
        }
    }

    fun shareToSMS(context: Context, message: String) {
        val plainText = stripMarkdown(message)
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:")
            putExtra("sms_body", plainText)
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Impossible d'ouvrir le gestionnaire SMS", Toast.LENGTH_SHORT).show()
        }
    }

    fun shareToEmail(context: Context, subject: String, body: String) {
        val plainText = stripMarkdown(body)
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:")
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, plainText)
        }
        try {
            context.startActivity(Intent.createChooser(intent, "Envoyer par email"))
        } catch (e: Exception) {
            Toast.makeText(context, "Aucun client email disponible", Toast.LENGTH_SHORT).show()
        }
    }

    fun shareGeneric(context: Context, message: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, message)
        }
        context.startActivity(Intent.createChooser(intent, "Partager via…"))
    }

    fun sendSMSDirectly(context: Context, phoneNumber: String, message: String) {
        try {
            val smsManager = context.getSystemService(SmsManager::class.java)
            val plainText = stripMarkdown(message)
            if (plainText.length > 160) {
                val parts = smsManager.divideMessage(plainText)
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(phoneNumber, null, plainText, null, null)
            }
        } catch (e: Exception) {
            Toast.makeText(context, "Erreur envoi SMS: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun stripMarkdown(text: String): String =
        text.replace(Regex("[*_~`]"), "")
            .replace(Regex("━+"), "---")
            .trim()
}
