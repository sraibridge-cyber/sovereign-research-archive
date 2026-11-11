package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query
import com.sraibridge.sovereign.data.entity.DocumentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DocumentDao {
    @Query(
        """
        SELECT d.*, s.original_name AS source_name
        FROM documents d
        JOIN sources s ON s.source_id = d.source_id
        WHERE documents_fts MATCH :query
        ORDER BY rank
        LIMIT :limit
        """
    )
    fun searchFts(query: String, limit: Int = 50): Flow<List<DocumentWithSource>>

    @Query("SELECT * FROM documents WHERE source_id = :sourceId")
    suspend fun getDocumentBySourceId(sourceId: String): DocumentEntity?

    @Query("SELECT * FROM documents WHERE id = :id")
    suspend fun getDocument(id: Long): DocumentEntity?

    @Query("SELECT COUNT(*) FROM documents")
    suspend fun getDocumentCount(): Int

    @Query(
        """
        SELECT d.*, s.original_name AS source_name
        FROM documents d
        JOIN sources s ON s.source_id = d.source_id
        ORDER BY d.ingested_at DESC
        LIMIT :limit
        """
    )
    fun getRecentDocuments(limit: Int = 20): Flow<List<DocumentWithSource>>
}

data class DocumentWithSource(
    val id: Long,
    val source_id: String,
    val title: String,
    val content_plain: String,
    val sha3_512: String,
    val source_path: String?,
    val file_type: String?,
    val ingested_at: String?,
    val source_name: String?
)