package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.RawQuery
import androidx.sqlite.db.SupportSQLiteQuery
import com.sraibridge.sovereign.data.entity.DocumentEntity
import com.sraibridge.sovereign.data.entity.MerkleSealEntity

@Dao
interface DocumentDao {
    @Query("SELECT * FROM documents WHERE id = :id")
    suspend fun getDocument(id: Long): DocumentEntity?

    @Query("SELECT * FROM documents WHERE id IN (:ids)")
    suspend fun getDocuments(ids: List<Long>): List<DocumentEntity>

    @Query("SELECT COUNT(*) FROM documents")
    suspend fun getDocumentCount(): Int

    @Query("SELECT * FROM documents ORDER BY ingested_at DESC LIMIT :limit")
    suspend fun getRecentDocuments(limit: Int): List<DocumentEntity>

    /** Plain substring search, used when the FTS5 index is missing or unsupported. */
    @Query(
        """
        SELECT * FROM documents
        WHERE title LIKE :pattern OR content_plain LIKE :pattern
        ORDER BY ingested_at DESC
        LIMIT :limit
        """
    )
    suspend fun likeSearch(pattern: String, limit: Int): List<DocumentEntity>

    @Query("SELECT * FROM merkle_seals ORDER BY id DESC LIMIT 1")
    suspend fun getLatestSeal(): MerkleSealEntity?

    /**
     * For queries against `documents_fts`. Room does not model FTS5 virtual tables, so
     * those queries cannot be checked at compile time and go through here.
     */
    @RawQuery
    suspend fun rawDocuments(query: SupportSQLiteQuery): List<DocumentEntity>
}
