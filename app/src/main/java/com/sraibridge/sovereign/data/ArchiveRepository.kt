package com.sraibridge.sovereign.data

import android.database.sqlite.SQLiteException
import androidx.sqlite.db.SimpleSQLiteQuery
import com.sraibridge.sovereign.data.entity.DocumentEntity
import kotlin.math.log10

/**
 * Search over archive.db, matching the behaviour of src/research_index.js.
 */
class ArchiveRepository(db: ArchiveDatabase) {

    private val documents = db.documentDao()
    private val semantic = db.semanticDao()

    data class RankedDocument(
        val document: DocumentEntity,
        val score: Double?,
        val method: String
    )

    /** FTS5 prefix search; falls back to substring search if the FTS5 index is unavailable. */
    suspend fun ftsSearch(query: String, limit: Int = DEFAULT_LIMIT): List<RankedDocument> {
        val tokens = query.trim()
            .split(WHITESPACE)
            .map { it.replace("\"", "") }
            .filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return emptyList()
        val ftsQuery = tokens.joinToString(" ") { "\"$it\"*" }

        return try {
            documents.rawDocuments(SimpleSQLiteQuery(FTS_SQL, arrayOf<Any>(ftsQuery, limit)))
                .map { RankedDocument(it, null, "FTS5") }
        } catch (_: SQLiteException) {
            // No documents_fts table (no bundled archive) or no FTS5 module on this device.
            documents.likeSearch("%${query.trim()}%", limit)
                .map { RankedDocument(it, null, "LIKE") }
        }
    }

    /**
     * TF-IDF ranking with the same formula as ResearchIndex.tfidfSearch:
     * sum over query terms of (freq / max freq in doc) * log10(totalDocs / docFrequency).
     */
    suspend fun tfidfSearch(query: String, limit: Int = DEFAULT_LIMIT): List<RankedDocument> {
        val terms = query.lowercase()
            .replace(NON_TERM_CHARS, " ")
            .split(WHITESPACE)
            .filter { it.length > 2 }
            .distinct()
        if (terms.isEmpty()) return emptyList()

        val totalDocs = documents.getDocumentCount()
        if (totalDocs == 0) return emptyList()

        val hits = terms.chunked(MAX_SQL_ARGS).flatMap { semantic.hitsForTerms(it) }
        if (hits.isEmpty()) return emptyList()

        val docFrequency = terms.chunked(MAX_SQL_ARGS)
            .flatMap { semantic.documentFrequencies(it) }
            .associate { it.term to it.df }
        val maxFrequency = hits.map { it.doc_id }.distinct()
            .chunked(MAX_SQL_ARGS)
            .flatMap { semantic.maxFrequencies(it) }
            .associate { it.doc_id to it.max_freq }

        val scores = HashMap<Long, Double>()
        for (hit in hits) {
            val maxFreq = maxFrequency[hit.doc_id] ?: continue
            val df = docFrequency[hit.term] ?: continue
            if (maxFreq <= 0 || df <= 0) continue
            val score = (hit.freq.toDouble() / maxFreq) * log10(totalDocs.toDouble() / df)
            scores[hit.doc_id] = (scores[hit.doc_id] ?: 0.0) + score
        }

        val top = scores.entries.sortedByDescending { it.value }.take(limit)
        val byId = documents.getDocuments(top.map { it.key }).associateBy { it.id }
        return top.mapNotNull { entry ->
            byId[entry.key]?.let { RankedDocument(it, entry.value, "TF-IDF") }
        }
    }

    suspend fun getDocument(id: Long): DocumentEntity? = documents.getDocument(id)

    companion object {
        private const val DEFAULT_LIMIT = 50
        private const val MAX_SQL_ARGS = 500
        private val WHITESPACE = Regex("\\s+")
        private val NON_TERM_CHARS = Regex("[^a-z0-9\\s-]")
        private const val FTS_SQL = """
            SELECT documents.*
            FROM documents_fts
            JOIN documents ON documents.id = documents_fts.rowid
            WHERE documents_fts MATCH ?
            ORDER BY documents_fts.rank
            LIMIT ?
        """
    }
}
