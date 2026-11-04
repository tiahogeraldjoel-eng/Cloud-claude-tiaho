package com.tiaho.coffrefort.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface DocumentDao {

    @Insert
    suspend fun insert(document: DocumentEntity): Long

    @Update
    suspend fun update(document: DocumentEntity)

    @Delete
    suspend fun delete(document: DocumentEntity)

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
