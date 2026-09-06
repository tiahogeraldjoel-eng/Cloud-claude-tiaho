package com.tiaho.coffrefort.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "documents")
data class DocumentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val category: String,
    val expirationDate: String,
    val encryptedPath: String,
    val ocrText: String,
    /** Verso du document (carte bancaire, ID, permis…), optionnel. */
    val encryptedPathBack: String? = null
)
