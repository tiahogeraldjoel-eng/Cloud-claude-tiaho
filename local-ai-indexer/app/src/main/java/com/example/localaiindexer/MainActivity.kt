package com.example.localaiindexer

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import io.objectbox.Box
import io.objectbox.BoxStore
import io.objectbox.annotation.Entity
import io.objectbox.annotation.HnswIndex
import io.objectbox.annotation.Id
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.sqrt

// ==========================================
// 1. ENTITÉ BASE DE DONNÉES VECTORIELLE
// ==========================================
@Entity
data class DocumentEntity(
    @Id var id: Long = 0,
    var title: String = "",
    var contentChunk: String = "",
    var filePath: String = "",
    var timestamp: Long = System.currentTimeMillis(),

    @HnswIndex(dimensions = 384)
    var embedding: FloatArray = floatArrayOf()
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as DocumentEntity
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()
}

// ==========================================
// 2. MOTEUR D'EMBEDDING LOCAL (VECTORISATEUR)
// ==========================================
class LocalEmbeddingEngine {

    suspend fun generateEmbedding(text: String): FloatArray = withContext(Dispatchers.Default) {
        val vector = FloatArray(384)
        val hash = text.hashCode()

        for (i in 0 until 384) {
            vector[i] = kotlin.math.sin((hash + i).toDouble()).toFloat()
        }
        return@withContext normalize(vector)
    }

    private fun normalize(vector: FloatArray): FloatArray {
        var norm = 0.0f
        for (v in vector) norm += v * v
        norm = sqrt(norm)
        if (norm > 0) {
            for (i in vector.indices) vector[i] /= norm
        }
        return vector
    }
}

// ==========================================
// 3. SERVICE OCR ML KIT
// ==========================================
class DocumentIndexer(private val context: Context) {
    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    suspend fun extractTextFromImage(imageUri: Uri): String = withContext(Dispatchers.IO) {
        return@withContext try {
            val image = InputImage.fromFilePath(context, imageUri)
            val result = textRecognizer.process(image).await()
            result.text
        } catch (e: Exception) {
            ""
        }
    }
}

// ==========================================
// 4. PONT JNI / C++ (LLAMA.CPP)
// ==========================================
class LlamaBridge {
    companion object {
        init {
            System.loadLibrary("local_ai_jni")
        }

        // Emplacement attendu du modèle GGUF : stockage propre à l'app,
        // accessible sans permission particulière (scoped storage) et
        // atteignable via `adb push` sur un build debug.
        fun modelFile(context: Context): File =
            File(context.getExternalFilesDir(null), "model.gguf")
    }

    external fun loadModel(modelPath: String): Long
    external fun generateResponse(modelPtr: Long, prompt: String): String
    external fun freeModel(modelPtr: Long)
}

// ==========================================
// 5. ACTIVITÉ PRINCIPALE ET INTERFACE USER
// ==========================================
class MainActivity : ComponentActivity() {

    private lateinit var boxStore: BoxStore
    private lateinit var documentBox: Box<DocumentEntity>
    private val embeddingEngine = LocalEmbeddingEngine()
    private val llamaBridge = LlamaBridge()
    private var modelPtr: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialisation de la base vectorielle ObjectBox
        boxStore = MyObjectBox.builder()
            .androidContext(applicationContext)
            .build()
        documentBox = boxStore.boxFor(DocumentEntity::class.java)

        // Chargement du modèle natif via C++ (si présent sur l'appareil).
        val modelFile = LlamaBridge.modelFile(applicationContext)
        modelPtr = if (modelFile.exists()) {
            llamaBridge.loadModel(modelFile.absolutePath)
        } else {
            0L
        }

        setContent {
            LocalAIApp(
                documentBox = documentBox,
                embeddingEngine = embeddingEngine,
                llamaBridge = llamaBridge,
                modelPtr = modelPtr,
                modelPresent = modelFile.exists(),
                modelPath = modelFile.absolutePath,
                documentIndexer = DocumentIndexer(applicationContext)
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (modelPtr != 0L) {
            llamaBridge.freeModel(modelPtr)
        }
        boxStore.close()
    }
}

@Composable
fun LocalAIApp(
    documentBox: Box<DocumentEntity>,
    embeddingEngine: LocalEmbeddingEngine,
    llamaBridge: LlamaBridge,
    modelPtr: Long,
    modelPresent: Boolean,
    modelPath: String,
    documentIndexer: DocumentIndexer
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<DocumentEntity>>(emptyList()) }
    var synthesizedResponse by remember { mutableStateOf("") }
    var statusText by remember {
        mutableStateOf(if (modelPresent) "Prêt" else "Modèle introuvable : $modelPath")
    }

    val scope = rememberCoroutineScope()

    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            scope.launch {
                statusText = "Extraction OCR locale..."
                val extractedText = documentIndexer.extractTextFromImage(it)
                if (extractedText.isNotBlank()) {
                    val vector = embeddingEngine.generateEmbedding(extractedText)
                    val doc = DocumentEntity(
                        title = "Capture OCR",
                        contentChunk = extractedText,
                        filePath = it.toString(),
                        embedding = vector
                    )
                    withContext(Dispatchers.IO) { documentBox.put(doc) }
                    statusText = "Document vectorisé et stocké !"
                } else {
                    statusText = "Aucun texte détecté."
                }
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Recherche IA 100% Locale", style = MaterialTheme.typography.titleLarge)
        Text("Statut : $statusText", style = MaterialTheme.typography.labelMedium)

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = { imagePicker.launch("image/*") },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Indexer une image (OCR)")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Posez une question sur vos documents...") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                scope.launch {
                    statusText = "Recherche vectorielle..."
                    val queryVector = embeddingEngine.generateEmbedding(query)

                    val matchedDocs = withContext(Dispatchers.IO) {
                        documentBox.query()
                            .nearestNeighbors(DocumentEntity_.embedding, queryVector, 3)
                            .build()
                            .find()
                    }
                    results = matchedDocs

                    if (matchedDocs.isNotEmpty()) {
                        if (modelPtr != 0L) {
                            statusText = "Génération de la réponse locale..."
                            val context = matchedDocs.joinToString("\n") { it.contentChunk }
                            val prompt = "Contexte:\n$context\n\nQuestion: $query"

                            synthesizedResponse = withContext(Dispatchers.Default) {
                                llamaBridge.generateResponse(modelPtr, prompt)
                            }
                        } else {
                            synthesizedResponse =
                                "Modèle non chargé : placez model.gguf sur l'appareil (voir README) pour activer la synthèse."
                        }
                    } else {
                        synthesizedResponse = "Aucune correspondance vectorielle trouvée."
                    }
                    statusText = "Prêt"
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Rechercher")
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (synthesizedResponse.isNotBlank()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Synthèse par IA Locale :", style = MaterialTheme.typography.titleSmall)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(synthesizedResponse, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text("Sources extraites :", style = MaterialTheme.typography.titleMedium)

        LazyColumn {
            items(results) { doc ->
                Card(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(doc.title, style = MaterialTheme.typography.titleSmall)
                        Text(doc.contentChunk, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
