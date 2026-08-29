package com.tiaho.coffrefort.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface DocumentDao {

    @Insert
    suspend fun insert(document: DocumentEntity): Long

    @Query("SELECT * FROM documents ORDER BY id DESC")
    suspend fun getAll(): List<DocumentEntity>

    @Query(
        """
        SELECT * FROM documents
        WHERE title LIKE '%' || :query || '%'
           OR category LIKE '%' || :query || '%'
           OR ocrText LIKE '%' || :query || '%'
        ORDER BY id DESC
        """
    )
    suspend fun search(query: String): List<DocumentEntity>
}
