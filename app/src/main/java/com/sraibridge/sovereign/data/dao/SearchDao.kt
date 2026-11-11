package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query

@Dao
interface SearchDao {
    @Query(
        """
        SELECT d.source_id, d.title, s.original_name AS source_name,
               SUM(p.tfidf * qp.tfidf) / (SQRT(ds.norm_sq) * SQRT(:queryNormSq)) AS cosine_sim
        FROM postings p
        JOIN (
            SELECT term_id, tfidf
            FROM postings
            WHERE source_id = :querySourceId
        ) qp ON qp.term_id = p.term_id
        JOIN doc_stats ds ON ds.source_id = p.source_id
        JOIN documents d ON d.source_id = p.source_id
        JOIN sources s ON s.source_id = d.source_id
        WHERE p.source_id != :querySourceId
        GROUP BY p.source_id
        HAVING cosine_sim >= :threshold
        ORDER BY cosine_sim DESC
        LIMIT :limit
        """
    )
    suspend fun similaritySearch(
        querySourceId: String,
        threshold: Double = 0.1,
        limit: Int = 20,
        queryNormSq: Double = 1.0
    ): List<SimilarityResult>

    @Query("SELECT term, tfidf FROM postings p JOIN terms t ON t.term_id = p.term_id WHERE p.source_id = :sourceId")
    suspend fun getDocumentVector(sourceId: String): List<TermWeight>

    @Query("SELECT value FROM corpus_meta WHERE key = 'similarity_threshold'")
    suspend fun getSimilarityThreshold(): String?

    @Query("SELECT value FROM corpus_meta WHERE key = 'N'")
    suspend fun getDocumentCount(): String?
}

data class SimilarityResult(
    val source_id: String,
    val title: String,
    val source_name: String?,
    val cosine_sim: Double
)

data class TermWeight(
    val term: String,
    val tfidf: Double
)