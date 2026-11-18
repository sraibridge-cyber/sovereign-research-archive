package com.sraibridge.sovereign.data.dao

import androidx.room.Dao
import androidx.room.Query

/**
 * Reads `term_frequencies` for TF-IDF ranking. The scoring itself happens in Kotlin
 * (see ArchiveRepository) because Android SQLite does not reliably provide LOG().
 */
@Dao
interface SemanticDao {
    @Query("SELECT doc_id, term, freq FROM term_frequencies WHERE term IN (:terms)")
    suspend fun hitsForTerms(terms: List<String>): List<TermHit>

    @Query(
        """
        SELECT term, COUNT(DISTINCT doc_id) AS df
        FROM term_frequencies
        WHERE term IN (:terms)
        GROUP BY term
        """
    )
    suspend fun documentFrequencies(terms: List<String>): List<TermDf>

    @Query(
        """
        SELECT doc_id, MAX(freq) AS max_freq
        FROM term_frequencies
        WHERE doc_id IN (:docIds)
        GROUP BY doc_id
        """
    )
    suspend fun maxFrequencies(docIds: List<Long>): List<DocMaxFreq>
}

data class TermHit(
    val doc_id: Long,
    val term: String,
    val freq: Int
)

data class TermDf(
    val term: String,
    val df: Int
)

data class DocMaxFreq(
    val doc_id: Long,
    val max_freq: Int
)
