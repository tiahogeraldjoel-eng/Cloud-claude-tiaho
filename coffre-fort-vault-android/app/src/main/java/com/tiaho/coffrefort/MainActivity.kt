package com.tiaho.coffrefort

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Toast
import androidx.activity.result.IntentSenderRequest
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.tiaho.coffrefort.backup.BackupManager
import com.tiaho.coffrefort.crypto.CryptoManager
import com.tiaho.coffrefort.data.DocumentEntity
import com.tiaho.coffrefort.data.VaultDatabase
import com.tiaho.coffrefort.databinding.ActivityMainBinding
import com.tiaho.coffrefort.databinding.DialogAddDocumentBinding
import com.tiaho.coffrefort.databinding.DialogP2pBinding
import com.tiaho.coffrefort.lock.VaultLock
import com.tiaho.coffrefort.network.NetworkUtils
import com.tiaho.coffrefort.network.P2pClient
import com.tiaho.coffrefort.network.P2pServer
import com.tiaho.coffrefort.ocr.OcrHelper
import com.tiaho.coffrefort.ui.DocumentAdapter
import com.tiaho.coffrefort.util.DateExtractor
import com.tiaho.coffrefort.util.QrCodeGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private enum class CaptureMode { FRONT, BACK }
    private data class PendingDocument(val frontUri: Uri, val category: String)

    private lateinit var binding: ActivityMainBinding
    private val adapter = DocumentAdapter(
        onItemClick = { document -> viewDocument(document) },
        onItemLongClick = { document -> showSendDialog(document) }
    )
    private val database by lazy { VaultDatabase.getInstance(this) }
    private val p2pServer = P2pServer()

    private var isUnlocked = false
    private var authInProgress = false
    // Vrai pendant qu'une Activity externe (scanner, galerie, sélecteur de fichier) est
    // ouverte : évite de reverrouiller/re-demander une authentification à son retour.
    private var awaitingExternalResult = false

    private var captureMode = CaptureMode.FRONT
    private var pendingDocument: PendingDocument? = null

    private var pendingExportPassword: String? = null
    private var pendingImportUri: Uri? = null

    private val documentScanner by lazy {
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(options)
    }

    private val scannerLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        awaitingExternalResult = false
        if (result.resultCode == RESULT_OK) {
            val scanningResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
            val pageUri = scanningResult?.pages?.firstOrNull()?.imageUri
            if (pageUri != null) handleCapturedImage(pageUri)
        }
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        awaitingExternalResult = false
        if (uri != null) {
            lifecycleScope.launch {
                val resolvedUri = withContext(Dispatchers.IO) { resolveImportedUri(uri) }
                if (resolvedUri != null) {
                    handleCapturedImage(resolvedUri)
                } else {
                    Toast.makeText(
                        this@MainActivity,
                        "Format de fichier non pris en charge (image ou PDF uniquement).",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* aucune action requise, l'utilisateur choisit */ }

    private val createBackupFile = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        awaitingExternalResult = false
        val password = pendingExportPassword
        pendingExportPassword = null
        if (uri != null && password != null) performExport(uri, password)
    }

    private val pickBackupFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        awaitingExternalResult = false
        if (uri != null) {
            pendingImportUri = uri
            askImportPassword()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.root.visibility = View.INVISIBLE

        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = getString(R.string.app_name)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        binding.documentList.layoutManager = LinearLayoutManager(this)
        binding.documentList.adapter = adapter

        binding.addDocumentButton.setOnClickListener { showAddSourceDialog(CaptureMode.FRONT) }
        binding.p2pButton.setOnClickListener { showP2pDialog() }

        binding.searchField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = refreshDocumentList(s?.toString())
        })

        refreshDocumentList()
        p2pServer.start { title, category, data -> onDocumentReceived(title, category, data) }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_export -> { showExportDialog(); true }
            R.id.action_import -> {
                awaitingExternalResult = true
                pickBackupFile.launch(arrayOf("application/zip", "application/octet-stream"))
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    override fun onResume() {
        super.onResume()
        if (!isUnlocked && !authInProgress) requestUnlock()
    }

    override fun onStop() {
        super.onStop()
        // Reverrouille le coffre-fort quand on quitte vraiment l'application — mais pas
        // quand on est simplement en train d'attendre le retour d'une Activity externe
        // (scanner, galerie, sélecteur de fichier), sinon un nouveau verrou apparaît par-dessus
        // le résultat au retour et donne l'impression que la sélection n'a rien fait.
        if (!awaitingExternalResult) {
            isUnlocked = false
            binding.root.visibility = View.INVISIBLE
        }
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

    // ---------------------------------------------------------------------
    // Ajout d'un document (caméra ou galerie, recto puis verso optionnel)
    // ---------------------------------------------------------------------

    private fun showAddSourceDialog(mode: CaptureMode) {
        captureMode = mode
        val options = arrayOf(getString(R.string.take_photo), getString(R.string.choose_from_gallery))
        AlertDialog.Builder(this)
            .setTitle(if (mode == CaptureMode.FRONT) R.string.add_document_choice_title else R.string.add_back_choice_title)
            .setItems(options) { _, which ->
                if (which == 0) {
                    launchDocumentScanner()
                } else {
                    awaitingExternalResult = true
                    // Pas de filtre MIME strict : certains gestionnaires de fichiers/fournisseurs
                    // cloud ne déclarent pas (ou mal) le type MIME d'une image ou d'un PDF, ce qui
                    // les grisait et les rendait sélectionnables en apparence seulement. Le type
                    // réel est vérifié après sélection dans resolveImportedUri().
                    pickImage.launch(arrayOf("*/*"))
                }
            }
            .show()
    }

    private fun launchDocumentScanner() {
        awaitingExternalResult = true
        documentScanner.getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener {
                awaitingExternalResult = false
                Toast.makeText(
                    this,
                    "Impossible de démarrer le scanner. Réessayez ou utilisez la galerie.",
                    Toast.LENGTH_LONG
                ).show()
            }
    }

    /**
     * Vérifie et normalise l'URI importée : un PDF voit sa première page rendue en image ;
     * une image valide est renvoyée telle quelle ; tout le reste renvoie null.
     *
     * Ni le type MIME déclaré par le fournisseur (souvent générique ou nul chez de nombreux
     * gestionnaires de fichiers/stockages cloud) ni un flux content:// ouvert plusieurs fois
     * (peu fiable selon le fournisseur) ne sont utilisés : le contenu est lu une seule fois en
     * mémoire, puis sniffé/décodé directement, comme decryptToBitmap le fait déjà pour les
     * documents stockés dans l'app.
     */
    private fun resolveImportedUri(uri: Uri): Uri? {
        val bytes = try {
            contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            null
        } ?: return null

        if (isPdfHeader(bytes)) {
            return try {
                val pdfBitmap = renderFirstPdfPage(bytes) ?: return null
                val importDir = File(cacheDir, "pdf_import").apply { mkdirs() }
                val tempFile = File(importDir, "page_${System.currentTimeMillis()}.jpg")
                FileOutputStream(tempFile).use { out -> pdfBitmap.compress(Bitmap.CompressFormat.JPEG, 90, out) }
                FileProvider.getUriForFile(this, "$packageName.fileprovider", tempFile)
            } catch (e: Exception) {
                null
            }
        }

        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        return if (options.outWidth > 0 && options.outHeight > 0) uri else null
    }

    private fun isPdfHeader(bytes: ByteArray): Boolean =
        bytes.size >= 4 && bytes[0] == '%'.code.toByte() && bytes[1] == 'P'.code.toByte() &&
            bytes[2] == 'D'.code.toByte() && bytes[3] == 'F'.code.toByte()

    /**
     * PdfRenderer exige un descripteur de fichier local, "mappable" en mémoire (mmap) : l'ouvrir
     * directement sur l'URI content:// choisie échoue silencieusement (IOException) pour beaucoup
     * de fournisseurs (Drive, WhatsApp, certains gestionnaires de fichiers) qui exposent un flux
     * réseau/pipe plutôt qu'un vrai fichier. On écrit donc d'abord le contenu déjà lu dans un
     * fichier local avant de le passer à PdfRenderer.
     */
    private fun renderFirstPdfPage(pdfBytes: ByteArray): Bitmap? {
        val tempPdf = File(cacheDir, "pdf_import_src_${System.currentTimeMillis()}.pdf")
        try {
            FileOutputStream(tempPdf).use { it.write(pdfBytes) }

            return ParcelFileDescriptor.open(tempPdf, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { renderer ->
                    if (renderer.pageCount == 0) return null
                    renderer.openPage(0).use { page ->
                        val bitmap = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bitmap
                    }
                }
            }
        } finally {
            tempPdf.delete()
        }
    }

    private fun handleCapturedImage(uri: Uri) {
        when (captureMode) {
            CaptureMode.FRONT -> showAddDocumentDialog(uri)
            CaptureMode.BACK -> {
                val pending = pendingDocument ?: return
                pendingDocument = null
                saveDocument(pending.frontUri, pending.category, uri)
            }
        }
    }

    private fun showAddDocumentDialog(frontUri: Uri) {
        val dialogBinding = DialogAddDocumentBinding.inflate(LayoutInflater.from(this))
        AlertDialog.Builder(this)
            .setTitle("Ajouter Document")
            .setView(dialogBinding.root)
            .setPositiveButton("Suivant") { _, _ ->
                val category = dialogBinding.categoryInput.text.toString().ifBlank { "Général" }
                askForBackSide(frontUri, category)
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun askForBackSide(frontUri: Uri, category: String) {
        AlertDialog.Builder(this)
            .setTitle(R.string.add_back_choice_title)
            .setMessage("Voulez-vous aussi ajouter une photo du verso (dos de la carte) ?")
            .setPositiveButton("Oui") { _, _ ->
                pendingDocument = PendingDocument(frontUri, category)
                showAddSourceDialog(CaptureMode.BACK)
            }
            .setNegativeButton("Non, terminer") { _, _ -> saveDocument(frontUri, category, null) }
            .show()
    }

    private fun saveDocument(frontUri: Uri, category: String, backUri: Uri?) {
        lifecycleScope.launch {
            val title = queryDisplayName(frontUri) ?: "document.jpg"
            val frontOcr = OcrHelper.extractText(this@MainActivity, frontUri)
            val backOcr = backUri?.let { OcrHelper.extractText(this@MainActivity, it) } ?: ""
            val combinedText = listOf(frontOcr, backOcr).filter { it.isNotBlank() }.joinToString("\n")
            val expirationDate = DateExtractor.extract(combinedText)

            withContext(Dispatchers.IO) {
                val documentsDir = File(filesDir, "documents").apply { mkdirs() }

                val frontBytes = contentResolver.openInputStream(frontUri)?.use { it.readBytes() } ?: ByteArray(0)
                val frontFile = File(documentsDir, "enc_${System.currentTimeMillis()}_front.dat")
                frontFile.writeBytes(CryptoManager.encrypt(frontBytes))

                val backFile = backUri?.let { uri ->
                    val backBytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                    File(documentsDir, "enc_${System.currentTimeMillis()}_back.dat").apply {
                        writeBytes(CryptoManager.encrypt(backBytes))
                    }
                }

                database.documentDao().insert(
                    DocumentEntity(
                        title = title,
                        category = category,
                        expirationDate = expirationDate,
                        encryptedPath = frontFile.absolutePath,
                        ocrText = combinedText,
                        encryptedPathBack = backFile?.absolutePath
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

    // ---------------------------------------------------------------------
    // Consultation, modification, suppression
    // ---------------------------------------------------------------------

    private suspend fun decryptToBitmap(path: String): Bitmap? = withContext(Dispatchers.IO) {
        try {
            val encrypted = File(path).readBytes()
            val decrypted = CryptoManager.decrypt(encrypted)
            BitmapFactory.decodeByteArray(decrypted, 0, decrypted.size)
        } catch (e: Exception) {
            null
        }
    }

    private fun viewDocument(document: DocumentEntity) {
        lifecycleScope.launch {
            val frontBitmap = decryptToBitmap(document.encryptedPath)
            if (frontBitmap == null) {
                Toast.makeText(this@MainActivity, "Impossible d'ouvrir ce document.", Toast.LENGTH_SHORT).show()
                return@launch
            }
            val backBitmap = document.encryptedPathBack?.let { decryptToBitmap(it) }

            val container = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
            container.addView(imageViewFor(frontBitmap))
            if (backBitmap != null) {
                container.addView(imageViewFor(backBitmap).apply { setPadding(0, 24, 0, 0) })
            }
            val scrollView = ScrollView(this@MainActivity).apply { addView(container) }

            AlertDialog.Builder(this@MainActivity)
                .setTitle(document.title)
                .setView(scrollView)
                .setPositiveButton("Fermer", null)
                .setNeutralButton("Modifier") { _, _ -> showEditCategoryDialog(document) }
                .setNegativeButton("Supprimer") { _, _ -> confirmDelete(document) }
                .show()
        }
    }

    private fun imageViewFor(bitmap: Bitmap): ImageView = ImageView(this).apply {
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        scaleType = ImageView.ScaleType.FIT_CENTER
        setImageBitmap(bitmap)
    }

    private fun showEditCategoryDialog(document: DocumentEntity) {
        val dialogBinding = DialogAddDocumentBinding.inflate(LayoutInflater.from(this))
        dialogBinding.categoryInput.setText(document.category)
        AlertDialog.Builder(this)
            .setTitle("Modifier la catégorie")
            .setView(dialogBinding.root)
            .setPositiveButton("Enregistrer") { _, _ ->
                val newCategory = dialogBinding.categoryInput.text.toString().ifBlank { "Général" }
                lifecycleScope.launch {
                    withContext(Dispatchers.IO) {
                        database.documentDao().update(document.copy(category = newCategory))
                    }
                    refreshDocumentList()
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun confirmDelete(document: DocumentEntity) {
        AlertDialog.Builder(this)
            .setTitle("Supprimer ce document ?")
            .setMessage("Cette action est irréversible.")
            .setPositiveButton("Supprimer") { _, _ ->
                lifecycleScope.launch {
                    withContext(Dispatchers.IO) {
                        File(document.encryptedPath).delete()
                        document.encryptedPathBack?.let { File(it).delete() }
                        database.documentDao().delete(document)
                    }
                    refreshDocumentList()
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    // ---------------------------------------------------------------------
    // Partage P2P (envoi et réception)
    // ---------------------------------------------------------------------

    private fun showP2pDialog() {
        val localIp = NetworkUtils.getLocalIpAddress()
        val connectionStr = "VAULT_P2P:$localIp:${P2pServer.DEFAULT_PORT}"

        val dialogBinding = DialogP2pBinding.inflate(LayoutInflater.from(this))
        dialogBinding.qrImage.setImageBitmap(QrCodeGenerator.generate(connectionStr))
        dialogBinding.ipLabel.text = "IP Locale : $localIp"

        AlertDialog.Builder(this)
            .setTitle("Appairage P2P Hors-Ligne")
            .setView(dialogBinding.root)
            .setPositiveButton("Fermer", null)
            .show()
    }

    private fun showSendDialog(document: DocumentEntity) {
        val input = EditText(this).apply {
            hint = "Adresse IP du destinataire"
            inputType = InputType.TYPE_CLASS_TEXT
        }
        AlertDialog.Builder(this)
            .setTitle("Envoyer « ${document.title} » en P2P")
            .setMessage("Entrez l'IP locale affichée sur l'écran « Partage P2P/QR » de l'appareil destinataire (même réseau Wi-Fi/Hotspot requis).")
            .setView(input)
            .setPositiveButton("Envoyer") { _, _ ->
                val host = input.text.toString().trim()
                if (host.isNotEmpty()) sendDocument(document, host)
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun sendDocument(document: DocumentEntity, host: String) {
        lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) {
                try {
                    val encrypted = File(document.encryptedPath).readBytes()
                    val plaintext = CryptoManager.decrypt(encrypted)
                    P2pClient.send(host, P2pServer.DEFAULT_PORT, document.title, document.category, plaintext)
                    true
                } catch (e: Exception) {
                    false
                }
            }
            Toast.makeText(
                this@MainActivity,
                if (success) "Document envoyé." else "Échec de l'envoi. Vérifiez l'IP et le réseau.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun onDocumentReceived(title: String, category: String, data: ByteArray) {
        lifecycleScope.launch {
            val tempFile = withContext(Dispatchers.IO) {
                File(cacheDir, "p2p_incoming_${System.currentTimeMillis()}.jpg").apply { writeBytes(data) }
            }
            val tempUri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", tempFile)
            val ocrText = OcrHelper.extractText(this@MainActivity, tempUri)
            val expirationDate = DateExtractor.extract(ocrText)

            withContext(Dispatchers.IO) {
                val documentsDir = File(filesDir, "documents").apply { mkdirs() }
                val encryptedFile = File(documentsDir, "enc_${System.currentTimeMillis()}_p2p.dat")
                encryptedFile.writeBytes(CryptoManager.encrypt(data))
                tempFile.delete()

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
            Toast.makeText(this@MainActivity, "Document reçu : $title", Toast.LENGTH_SHORT).show()
        }
    }

    // ---------------------------------------------------------------------
    // Sauvegarde chiffrée (export / import)
    // ---------------------------------------------------------------------

    private fun showExportDialog() {
        val input = EditText(this).apply {
            hint = "Mot de passe de sauvegarde"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.export_backup)
            .setMessage("Ce mot de passe sera nécessaire pour restaurer la sauvegarde sur ce téléphone ou un autre — notez-le, il n'est jamais enregistré.")
            .setView(input)
            .setPositiveButton("Continuer") { _, _ ->
                val password = input.text.toString()
                if (password.length < 4) {
                    Toast.makeText(this, "Mot de passe trop court (4 caractères minimum).", Toast.LENGTH_SHORT).show()
                } else {
                    pendingExportPassword = password
                    awaitingExternalResult = true
                    createBackupFile.launch("coffre-fort-backup-${System.currentTimeMillis()}.zip")
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun performExport(uri: Uri, password: String) {
        lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) {
                try {
                    val documents = database.documentDao().getAll()
                    BackupManager.export(documents, password, uri, this@MainActivity)
                    true
                } catch (e: Exception) {
                    false
                }
            }
            Toast.makeText(
                this@MainActivity,
                if (success) "Sauvegarde exportée." else "Échec de l'export.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun askImportPassword() {
        val input = EditText(this).apply {
            hint = "Mot de passe de la sauvegarde"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.import_backup)
            .setView(input)
            .setPositiveButton("Importer") { _, _ ->
                val uri = pendingImportUri
                pendingImportUri = null
                if (uri != null) performImport(uri, input.text.toString())
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun performImport(uri: Uri, password: String) {
        lifecycleScope.launch {
            val importedCount = withContext(Dispatchers.IO) {
                try {
                    var count = 0
                    BackupManager.import(uri, password, this@MainActivity) { document ->
                        database.documentDao().insert(document)
                        count++
                    }
                    count
                } catch (e: Exception) {
                    -1
                }
            }
            val message = if (importedCount < 0) {
                "Échec de l'import : mot de passe incorrect ou fichier invalide."
            } else {
                "$importedCount document(s) importé(s)."
            }
            Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            refreshDocumentList()
        }
    }
}
