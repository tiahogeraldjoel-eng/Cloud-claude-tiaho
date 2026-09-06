package com.tiaho.coffrefort.backup

import android.content.Context
import android.net.Uri
import android.util.Base64
import com.tiaho.coffrefort.crypto.CryptoManager
import com.tiaho.coffrefort.data.DocumentEntity
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Exporte/importe une sauvegarde portable, protégée par un mot de passe
 * (PBKDF2 + AES-256/GCM) plutôt que par la clé de l'Android Keystore : cette
 * dernière n'est jamais extractible de l'appareil, donc inutilisable pour
 * restaurer les documents sur un autre téléphone.
 */
object BackupManager {
    private const val ITERATIONS = 100_000
    private const val KEY_LENGTH_BITS = 256
    private const val GCM_TAG_LENGTH_BITS = 128

    private fun deriveKey(password: String, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return SecretKeySpec(factory.generateSecret(spec).encoded, "AES")
    }

    private fun encryptWithKey(key: SecretKeySpec, data: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(data)
        return ByteBuffer.allocate(4 + iv.size + ciphertext.size)
            .putInt(iv.size).put(iv).put(ciphertext).array()
    }

    private fun decryptWithKey(key: SecretKeySpec, payload: ByteArray): ByteArray {
        val buffer = ByteBuffer.wrap(payload)
        val ivSize = buffer.int
        val iv = ByteArray(ivSize).also { buffer.get(it) }
        val ciphertext = ByteArray(buffer.remaining()).also { buffer.get(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return cipher.doFinal(ciphertext)
    }

    fun export(documents: List<DocumentEntity>, password: String, outputUri: Uri, context: Context) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val key = deriveKey(password, salt)

        context.contentResolver.openOutputStream(outputUri)?.use { rawOut ->
            ZipOutputStream(rawOut).use { zip ->
                val manifestEntries = JSONArray()

                documents.forEachIndexed { index, document ->
                    val frontPlain = CryptoManager.decrypt(File(document.encryptedPath).readBytes())
                    val frontName = "$index.dat"
                    zip.putNextEntry(ZipEntry(frontName))
                    zip.write(encryptWithKey(key, frontPlain))
                    zip.closeEntry()

                    val backName = document.encryptedPathBack?.let { backPath ->
                        val backPlain = CryptoManager.decrypt(File(backPath).readBytes())
                        val name = "${index}_back.dat"
                        zip.putNextEntry(ZipEntry(name))
                        zip.write(encryptWithKey(key, backPlain))
                        zip.closeEntry()
                        name
                    }

                    manifestEntries.put(
                        JSONObject().apply {
                            put("title", document.title)
                            put("category", document.category)
                            put("expirationDate", document.expirationDate)
                            put("ocrText", document.ocrText)
                            put("front", frontName)
                            put("back", backName ?: JSONObject.NULL)
                        }
                    )
                }

                val manifest = JSONObject().apply {
                    put("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
                    put("documents", manifestEntries)
                }
                zip.putNextEntry(ZipEntry("manifest.json"))
                zip.write(manifest.toString().toByteArray())
                zip.closeEntry()
            }
        } ?: throw IllegalStateException("Impossible d'écrire le fichier de sauvegarde")
    }

    /** Déchiffre la sauvegarde et ré-encode chaque document avec la clé de CET appareil. */
    suspend fun import(inputUri: Uri, password: String, context: Context, onDocument: suspend (DocumentEntity) -> Unit) {
        val filesByName = mutableMapOf<String, ByteArray>()
        var manifestJson: String? = null

        context.contentResolver.openInputStream(inputUri)?.use { rawIn ->
            ZipInputStream(rawIn).use { zip ->
                var entry = zip.nextEntry
                while (entry != null) {
                    val bytes = zip.readBytes()
                    if (entry.name == "manifest.json") manifestJson = String(bytes) else filesByName[entry.name] = bytes
                    entry = zip.nextEntry
                }
            }
        } ?: throw IllegalStateException("Impossible de lire le fichier de sauvegarde")

        val manifest = JSONObject(manifestJson ?: throw IllegalArgumentException("Fichier de sauvegarde invalide"))
        val salt = Base64.decode(manifest.getString("salt"), Base64.NO_WRAP)
        val key = deriveKey(password, salt)

        val documentsDir = File(context.filesDir, "documents").apply { mkdirs() }
        val docsArray = manifest.getJSONArray("documents")

        for (i in 0 until docsArray.length()) {
            val entryJson = docsArray.getJSONObject(i)
            val frontEncrypted = filesByName[entryJson.getString("front")] ?: continue
            val frontPlain = decryptWithKey(key, frontEncrypted)
            val frontFile = File(documentsDir, "enc_${System.currentTimeMillis()}_${i}_front.dat")
            frontFile.writeBytes(CryptoManager.encrypt(frontPlain))

            val backPath = if (entryJson.isNull("back")) null else entryJson.getString("back")?.let { backName ->
                filesByName[backName]?.let { backEncrypted ->
                    val backPlain = decryptWithKey(key, backEncrypted)
                    val backFile = File(documentsDir, "enc_${System.currentTimeMillis()}_${i}_back.dat")
                    backFile.writeBytes(CryptoManager.encrypt(backPlain))
                    backFile.absolutePath
                }
            }

            onDocument(
                DocumentEntity(
                    title = entryJson.getString("title"),
                    category = entryJson.getString("category"),
                    expirationDate = entryJson.getString("expirationDate"),
                    encryptedPath = frontFile.absolutePath,
                    ocrText = entryJson.getString("ocrText"),
                    encryptedPathBack = backPath
                )
            )
        }
    }
}
