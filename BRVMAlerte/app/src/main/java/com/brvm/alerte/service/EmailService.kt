package com.brvm.alerte.service

import com.brvm.alerte.domain.model.Alert
import com.brvm.alerte.domain.model.AlertPriority
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Properties
import javax.inject.Inject
import javax.inject.Singleton
import javax.mail.Message
import javax.mail.Session
import javax.mail.Transport
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeBodyPart
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeMultipart

data class EmailConfig(
    val smtpHost: String = "smtp.gmail.com",
    val smtpPort: Int = 587,
    val senderEmail: String = "",
    val senderPassword: String = "",
    val recipientEmails: List<String> = emptyList(),
    val enabled: Boolean = false
)

sealed class EmailResult {
    object Success : EmailResult()
    data class Failure(val error: String) : EmailResult()
    object Disabled : EmailResult()
}

@Singleton
class EmailService @Inject constructor() {

    private var config = EmailConfig()

    fun configure(
        senderEmail: String,
        senderPassword: String,
        recipientEmails: List<String>,
        smtpHost: String = "smtp.gmail.com",
        smtpPort: Int = 587
    ) {
        config = EmailConfig(
            smtpHost = smtpHost,
            smtpPort = smtpPort,
            senderEmail = senderEmail,
            senderPassword = senderPassword,
            recipientEmails = recipientEmails,
            enabled = senderEmail.isNotEmpty() && senderPassword.isNotEmpty() && recipientEmails.isNotEmpty()
        )
    }

    suspend fun sendAlert(alert: Alert): EmailResult = withContext(Dispatchers.IO) {
        if (!config.enabled) return@withContext EmailResult.Disabled
        if (config.recipientEmails.isEmpty()) return@withContext EmailResult.Disabled

        return@withContext try {
            val props = Properties().apply {
                put("mail.smtp.auth", "true")
                put("mail.smtp.starttls.enable", "true")
                put("mail.smtp.host", config.smtpHost)
                put("mail.smtp.port", config.smtpPort.toString())
                put("mail.smtp.ssl.trust", config.smtpHost)
                put("mail.smtp.connectiontimeout", "15000")
                put("mail.smtp.timeout", "15000")
            }

            val session = Session.getInstance(props, object : javax.mail.Authenticator() {
                override fun getPasswordAuthentication() =
                    javax.mail.PasswordAuthentication(config.senderEmail, config.senderPassword)
            })

            val message = MimeMessage(session).apply {
                setFrom(InternetAddress(config.senderEmail, "BRVM Alerte"))
                config.recipientEmails.forEach {
                    addRecipient(Message.RecipientType.TO, InternetAddress(it))
                }
                subject = buildSubject(alert)

                val multipart = MimeMultipart("alternative")
                val textPart = MimeBodyPart().apply { setText(buildPlainText(alert), "UTF-8") }
                val htmlPart = MimeBodyPart().apply { setContent(buildHtmlBody(alert), "text/html; charset=UTF-8") }
                multipart.addBodyPart(textPart)
                multipart.addBodyPart(htmlPart)
                setContent(multipart)
            }

            Transport.send(message)
            EmailResult.Success
        } catch (e: Exception) {
            EmailResult.Failure(e.message ?: "Erreur d'envoi email")
        }
    }

    suspend fun sendBatchReport(alerts: List<Alert>, date: String): EmailResult = withContext(Dispatchers.IO) {
        if (!config.enabled || alerts.isEmpty()) return@withContext EmailResult.Disabled

        return@withContext try {
            val props = Properties().apply {
                put("mail.smtp.auth", "true")
                put("mail.smtp.starttls.enable", "true")
                put("mail.smtp.host", config.smtpHost)
                put("mail.smtp.port", config.smtpPort.toString())
                put("mail.smtp.ssl.trust", config.smtpHost)
                put("mail.smtp.connectiontimeout", "15000")
                put("mail.smtp.timeout", "15000")
            }
            val session = Session.getInstance(props, object : javax.mail.Authenticator() {
                override fun getPasswordAuthentication() =
                    javax.mail.PasswordAuthentication(config.senderEmail, config.senderPassword)
            })
            val message = MimeMessage(session).apply {
                setFrom(InternetAddress(config.senderEmail, "BRVM Alerte"))
                config.recipientEmails.forEach { addRecipient(Message.RecipientType.TO, InternetAddress(it)) }
                subject = "📊 BRVM Alerte — Rapport du $date (${alerts.size} signaux)"
                val multipart = MimeMultipart("alternative")
                val htmlPart = MimeBodyPart().apply {
                    setContent(buildBatchHtmlReport(alerts, date), "text/html; charset=UTF-8")
                }
                multipart.addBodyPart(htmlPart)
                setContent(multipart)
            }
            Transport.send(message)
            EmailResult.Success
        } catch (e: Exception) {
            EmailResult.Failure(e.message ?: "Erreur rapport batch")
        }
    }

    private fun buildSubject(alert: Alert): String {
        val prefix = when (alert.priority) {
            AlertPriority.URGENT -> "🔴 URGENT"
            AlertPriority.STRONG -> "🟠 FORT"
            AlertPriority.MODERATE -> "🟡 MODÉRÉ"
            AlertPriority.INFO -> "🔵 INFO"
        }
        return "$prefix — ${alert.ticker} | Score ${alert.score}/100"
    }

    private fun buildPlainText(alert: Alert): String {
        return buildString {
            appendLine("BRVM ALERTE — ${alert.priority.label}")
            appendLine("=" .repeat(40))
            appendLine("Titre: ${alert.stockName} (${alert.ticker})")
            appendLine("Prix actuel: ${String.format("%.0f", alert.currentPrice)} FCFA")
            alert.targetPrice?.let { appendLine("Objectif: ${String.format("%.0f", it)} FCFA") }
            appendLine("Score: ${alert.score}/100")
            appendLine("Recommandation: ${alert.recommendation.name.replace("_", " ")}")
            appendLine()
            appendLine(alert.message.replace(Regex("[*_~`━]"), ""))
            appendLine()
            appendLine("---")
            appendLine("BRVM Alerte — Analyse algorithmique automatisée")
            appendLine("Ce message ne constitue pas un conseil en investissement.")
        }
    }

    private fun buildHtmlBody(alert: Alert): String {
        val priorityColor = when (alert.priority) {
            AlertPriority.URGENT -> "#D32F2F"
            AlertPriority.STRONG -> "#F5A623"
            AlertPriority.MODERATE -> "#4FC3F7"
            AlertPriority.INFO -> "#8B949E"
        }
        val recColor = when (alert.recommendation.name) {
            "STRONG_BUY", "BUY" -> "#4CAF50"
            "STRONG_SELL", "SELL" -> "#D32F2F"
            else -> "#FF8F00"
        }
        val recLabel = when (alert.recommendation.name) {
            "STRONG_BUY" -> "ACHAT FORT"
            "BUY" -> "ACHAT"
            "HOLD" -> "CONSERVER"
            "SELL" -> "VENTE"
            else -> "VENTE FORTE"
        }
        val targetHtml = alert.targetPrice?.let {
            "<tr><td style='color:#8B949E'>Objectif de prix</td><td style='color:#F5A623;font-weight:bold'>${String.format("%.0f", it)} FCFA</td></tr>"
        } ?: ""

        return """
        <!DOCTYPE html><html><head><meta charset='UTF-8'>
        <meta name='viewport' content='width=device-width,initial-scale=1'>
        </head><body style='font-family:Arial,sans-serif;background:#0D1117;color:#E6EDF3;padding:20px;'>
        <div style='max-width:600px;margin:0 auto;'>
        <div style='background:#161B22;border-radius:12px;overflow:hidden;border:1px solid $priorityColor;'>
          <div style='background:$priorityColor;padding:16px;'>
            <h1 style='margin:0;font-size:18px;color:white;'>${alert.priority.emoji} ${alert.priority.label} — ${alert.ticker}</h1>
            <p style='margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;'>${alert.stockName}</p>
          </div>
          <div style='padding:16px;'>
            <table style='width:100%;border-collapse:collapse;margin-bottom:16px;'>
              <tr><td style='color:#8B949E;padding:6px 0;'>Prix actuel</td>
                  <td style='font-size:20px;font-weight:bold;'>${String.format("%.0f", alert.currentPrice)} FCFA</td></tr>
              <tr><td style='color:#8B949E;'>Score algorithmique</td>
                  <td style='color:$priorityColor;font-weight:bold;font-size:18px;'>${alert.score}/100</td></tr>
              <tr><td style='color:#8B949E;'>Recommandation</td>
                  <td style='color:$recColor;font-weight:bold;'>$recLabel</td></tr>
              $targetHtml
            </table>
            <div style='background:#0D1117;border-radius:8px;padding:12px;font-size:13px;white-space:pre-line;'>
              ${alert.message.replace(Regex("[*_`]"), "").replace("━", "─").replace("<", "&lt;").replace(">", "&gt;")}
            </div>
          </div>
          <div style='padding:12px 16px;border-top:1px solid #30363D;font-size:11px;color:#8B949E;'>
            BRVM Alerte — Analyse algorithmique automatisée.<br>
            Ce message ne constitue pas un conseil en investissement financier.
          </div>
        </div></div></body></html>
        """.trimIndent()
    }

    private fun buildBatchHtmlReport(alerts: List<Alert>, date: String): String {
        val rows = alerts.joinToString("") { alert ->
            val scoreColor = when {
                alert.score >= 75 -> "#D32F2F"
                alert.score >= 65 -> "#F5A623"
                else -> "#4FC3F7"
            }
            val recLabel = when (alert.recommendation.name) {
                "STRONG_BUY" -> "ACHAT FORT"
                "BUY" -> "ACHAT"
                "HOLD" -> "CONSERVER"
                "SELL" -> "VENTE"
                else -> "VENTE FORTE"
            }
            """<tr style='border-bottom:1px solid #30363D;'>
              <td style='padding:8px;font-weight:bold;'>${alert.ticker}</td>
              <td style='padding:8px;color:#8B949E;font-size:12px;'>${alert.stockName.take(25)}</td>
              <td style='padding:8px;'>${String.format("%.0f", alert.currentPrice)} F</td>
              <td style='padding:8px;color:$scoreColor;font-weight:bold;'>${alert.score}/100</td>
              <td style='padding:8px;'>${alert.priority.emoji} ${recLabel}</td>
            </tr>"""
        }

        return """
        <!DOCTYPE html><html><head><meta charset='UTF-8'></head>
        <body style='font-family:Arial,sans-serif;background:#0D1117;color:#E6EDF3;padding:20px;'>
        <div style='max-width:700px;margin:0 auto;background:#161B22;border-radius:12px;overflow:hidden;'>
          <div style='background:#00703C;padding:20px;'>
            <h1 style='margin:0;color:white;font-size:20px;'>📊 Rapport BRVM Alerte</h1>
            <p style='margin:4px 0 0;color:rgba(255,255,255,0.85);'>$date — ${alerts.size} signaux détectés</p>
          </div>
          <div style='padding:16px;overflow-x:auto;'>
          <table style='width:100%;border-collapse:collapse;'>
            <thead>
              <tr style='color:#8B949E;font-size:12px;text-transform:uppercase;'>
                <th style='padding:8px;text-align:left;'>Ticker</th>
                <th style='padding:8px;text-align:left;'>Société</th>
                <th style='padding:8px;text-align:left;'>Prix</th>
                <th style='padding:8px;text-align:left;'>Score</th>
                <th style='padding:8px;text-align:left;'>Signal</th>
              </tr>
            </thead>
            <tbody>$rows</tbody>
          </table>
          </div>
          <div style='padding:12px 16px;border-top:1px solid #30363D;font-size:11px;color:#8B949E;'>
            BRVM Alerte — Ce rapport ne constitue pas un conseil en investissement.
          </div>
        </div></body></html>
        """.trimIndent()
    }
}
