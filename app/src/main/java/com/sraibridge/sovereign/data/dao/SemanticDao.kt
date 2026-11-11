package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query

@Dao
interface SemanticDao {

    @Query("""
        SELECT doc_id, SUM(tfidf) AS score
        FROM term_frequencies
        WHERE term IN (SELECT value FROM json_each(:queryTerms))
        GROUP BY doc_id
        ORDER BY score DESC
        LIMIT :limit
    """)
    suspend fun vectorSearch(queryTerms: String, limit: Int): List<TfidfResult>

    @Query("SELECT term, freq FROM term_frequencies WHERE doc_id = :docId")
    suspend fun getTermFrequencies(docId: Long): List<TermFrequency>

    @Query("""
        INSERT INTO term_frequencies (doc_id, term, freq)
        VALUES (:docId, :term, :freq)
    """)
    suspend fun insertTermFrequency(docId: Long, term: String, freq: Int)

    @Query("INSERT OR REPLACE INTO corpus_stats (total_docs, total_terms, last_updated) VALUES (:totalDocs, :totalTerms, :updated)")
    suspend fun updateCorpusStats(totalDocs: Int, totalTerms: Int, updated: Long)
}

data class TfidfResult(
    val doc_id: Long,
    val score: Double
)

data class TermFrequency(
    val term: String,
    val freq: Int
)
