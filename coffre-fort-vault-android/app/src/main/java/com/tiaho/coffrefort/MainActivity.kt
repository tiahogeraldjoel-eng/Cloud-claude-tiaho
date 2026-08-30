package com.tiaho.coffrefort

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.tiaho.coffrefort.crypto.CryptoManager
import com.tiaho.coffrefort.data.DocumentEntity
import com.tiaho.coffrefort.data.VaultDatabase
import com.tiaho.coffrefort.databinding.ActivityMainBinding
import com.tiaho.coffrefort.databinding.DialogAddDocumentBinding
import com.tiaho.coffrefort.databinding.DialogP2pBinding
import com.tiaho.coffrefort.lock.VaultLock
import com.tiaho.coffrefort.network.NetworkUtils
import com.tiaho.coffrefort.network.P2pServer
import com.tiaho.coffrefort.ocr.OcrHelper
import com.tiaho.coffrefort.ui.DocumentAdapter
import com.tiaho.coffrefort.util.DateExtractor
import com.tiaho.coffrefort.util.QrCodeGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val adapter = DocumentAdapter { document -> viewDocument(document) }
    private val database by lazy { VaultDatabase.getInstance(this) }
    private val p2pServer = P2pServer()

    private var isUnlocked = false
    private var authInProgress = false

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { showAddDocumentDialog(it) }
    }

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* aucune action requise, l'utilisateur choisit */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.root.visibility = View.INVISIBLE

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        binding.documentList.layoutManager = LinearLayoutManager(this)
        binding.documentList.adapter = adapter

        binding.addDocumentButton.setOnClickListener { pickImage.launch("image/*") }
        binding.p2pButton.setOnClickListener { showP2pDialog() }

        binding.searchField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = refreshDocumentList(s?.toString())
        })

        refreshDocumentList()
        p2pServer.start { /* réception simplifiée, non traitée pour l'instant */ }
    }

    override fun onResume() {
        super.onResume()
        if (!isUnlocked && !authInProgress) requestUnlock()
    }

    override fun onStop() {
        super.onStop()
        // Reverrouille le coffre-fort dès qu'on quitte l'application.
        isUnlocked = false
        binding.root.visibility = View.INVISIBLE
    }

    override fun onDestroy() {
        super.onDestroy()
        p2pServer.stop()
    }

    private fun requestUnlock() {
        if (!VaultLock.isAvailable(this)) {
            // Aucun verrouillage d'écran configuré sur l'appareil : on ne peut pas
            // protéger l'accès, mais on prévient plutôt que de bloquer silencieusement.
            Toast.makeText(
                this,
                "Aucun verrouillage d'écran configuré sur cet appareil : le coffre-fort n'est pas protégé.",
                Toast.LENGTH_LONG
            ).show()
            isUnlocked = true
            binding.root.visibility = View.VISIBLE
            return
        }

        authInProgress = true
        VaultLock.authenticate(
            activity = this,
            onSuccess = {
                authInProgress = false
                isUnlocked = true
                binding.root.visibility = View.VISIBLE
            },
            onFailure = {
                authInProgress = false
                finish()
            }
        )
    }

    private fun showAddDocumentDialog(imageUri: Uri) {
        val dialogBinding = DialogAddDocumentBinding.inflate(LayoutInflater.from(this))
        AlertDialog.Builder(this)
            .setTitle("Ajouter Document")
            .setView(dialogBinding.root)
            .setPositiveButton("Enregistrer") { _, _ ->
                val category = dialogBinding.categoryInput.text.toString().ifBlank { "Général" }
                addDocument(imageUri, category)
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun addDocument(imageUri: Uri, category: String) {
        lifecycleScope.launch {
            val title = queryDisplayName(imageUri) ?: "document.jpg"
            val ocrText = OcrHelper.extractText(this@MainActivity, imageUri)
            val expirationDate = DateExtractor.extract(ocrText)

            withContext(Dispatchers.IO) {
                val bytes = contentResolver.openInputStream(imageUri)?.use { it.readBytes() } ?: ByteArray(0)
                val encrypted = CryptoManager.encrypt(bytes)

                val documentsDir = File(filesDir, "documents").apply { mkdirs() }
                val encryptedFile = File(documentsDir, "enc_${System.currentTimeMillis()}.dat")
                encryptedFile.writeBytes(encrypted)

                database.documentDao().insert(
                    DocumentEntity(
                        title = title,
                        category = category,
                        expirationDate = expirationDate,
                        encryptedPath = encryptedFile.absolutePath,
                        ocrText = ocrText
                    )
                )
            }

            refreshDocumentList()
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0 && cursor.moveToFirst()) return cursor.getString(nameIndex)
        }
        return null
    }

    private fun refreshDocumentList(query: String? = null) {
        lifecycleScope.launch {
            val documents = withContext(Dispatchers.IO) {
                if (query.isNullOrBlank()) database.documentDao().getAll()
                else database.documentDao().search(query)
            }
            adapter.submitList(documents)
            binding.emptyState.visibility = if (documents.isEmpty()) View.VISIBLE else View.GONE
        }
    }

    private fun viewDocument(document: DocumentEntity) {
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                try {
                    val encrypted = File(document.encryptedPath).readBytes()
                    val decrypted = CryptoManager.decrypt(encrypted)
                    BitmapFactory.decodeByteArray(decrypted, 0, decrypted.size)
                } catch (e: Exception) {
                    null
                }
            }

            if (bitmap == null) {
                Toast.makeText(this@MainActivity, "Impossible d'ouvrir ce document.", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val imageView = ImageView(this@MainActivity).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setImageBitmap(bitmap)
            }
            val scrollView = ScrollView(this@MainActivity).apply { addView(imageView) }

            AlertDialog.Builder(this@MainActivity)
                .setTitle(document.title)
                .setView(scrollView)
                .setPositiveButton("Fermer", null)
                .show()
        }
    }

    private fun showP2pDialog() {
        val localIp = NetworkUtils.getLocalIpAddress()
        val connectionStr = "VAULT_P2P:$localIp:5000"

        val dialogBinding = DialogP2pBinding.inflate(LayoutInflater.from(this))
        dialogBinding.qrImage.setImageBitmap(QrCodeGenerator.generate(connectionStr))
        dialogBinding.ipLabel.text = "IP Locale : $localIp"

        AlertDialog.Builder(this)
            .setTitle("Appairage P2P Hors-Ligne")
            .setView(dialogBinding.root)
            .setPositiveButton("Fermer", null)
            .show()
    }
}
