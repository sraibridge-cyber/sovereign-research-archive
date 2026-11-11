package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query
import com.sraibridge.sovereign.data.entity.DocumentEntity

@Dao
interface SearchDao {

    @Query("SELECT * FROM documents WHERE content_fts MATCH :query ORDER BY rank")
    suspend fun ftsSearch(query: String): List<DocumentEntity>

    @Query("SELECT * FROM documents WHERE id = :docId")
    suspend fun getDocumentById(docId: Long): DocumentEntity?

    @Query("SELECT COUNT(*) FROM documents")
    suspend fun documentCount(): Int

    @Query("""
        SELECT d.*, (
            SELECT SUM(tfidf)
            FROM (
                SELECT (CAST(freq AS REAL) / (SELECT MAX(freq) FROM term_frequencies WHERE doc_id = d.id)) *
                       (LOG((SELECT COUNT(*) FROM documents) / CAST((SELECT COUNT(*) FROM term_frequencies WHERE term = tf.term) AS REAL)))
                       AS tfidf
                FROM term_frequencies tf WHERE tf.doc_id = d.id
            )
        ) AS relevance
        FROM documents d
        WHERE d.id IN (
            SELECT doc_id FROM term_frequencies
            WHERE term IN (SELECT value FROM json_each(:terms))
            GROUP BY doc_id
            ORDER BY SUM(tfidf) DESC
            LIMIT :limit
        )
        ORDER BY relevance DESC
    """)
    suspend fun tfidfSearch(terms: String, limit: Int): List<DocumentEntity>

    @Query("""
        INSERT INTO documents (title, source_path, content_text, content_plain, sha3_512, file_type, ingested_at, word_count)
        VALUES (:title, :sourcePath, :contentText, :contentPlain, :sha3, :fileType, :ingestedAt, :wordCount)
    """)
    suspend fun insertDocument(
        title: String,
        sourcePath: String,
        contentText: String,
        contentPlain: String,
        sha3: String,
        fileType: String,
        ingestedAt: Long,
        wordCount: Int
    ): Long
}
