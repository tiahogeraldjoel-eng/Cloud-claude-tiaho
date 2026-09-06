package com.tiaho.coffrefort.ocr

import android.content.Context
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.tasks.await

object OcrHelper {

    /** Extrait le texte d'une image via le modèle OCR embarqué (fonctionne hors-ligne). */
    suspend fun extractText(context: Context, uri: Uri): String {
        return try {
            val image = InputImage.fromFilePath(context, uri)
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer.process(image).await().text
        } catch (e: Exception) {
            ""
        }
    }
}
