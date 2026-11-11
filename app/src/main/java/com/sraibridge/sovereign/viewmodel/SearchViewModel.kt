package com.sraibridge.sovereign.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.sraibridge.sovereign.data.ArchiveDatabase
import com.sraibridge.sovereign.data.entity.DocumentEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SearchResult(
    val title: String,
    val snippet: String,
    val score: String
)

data class SearchUiState(
    val query: String = "",
    val searchMode: String = "fts",
    val results: List<SearchResult> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val db = ArchiveDatabase.getInstance(application)
    private val searchDao = db.searchDao()
    private val semanticDao = db.semanticDao()

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    fun onQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        if (query.length >= 3) {
            performSearch()
        } else {
            _uiState.value = _uiState.value.copy(results = emptyList())
        }
    }

    fun setSearchMode(mode: String) {
        _uiState.value = _uiState.value.copy(searchMode = mode)
        if (_uiState.value.query.length >= 3) {
            performSearch()
        }
    }

    private fun performSearch() {
        val query = _uiState.value.query.trim()
        val mode = _uiState.value.searchMode
        if (query.length < 3) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val results = when (mode) {
                    "fts" -> ftsSearch(query)
                    "tfidf" -> tfidfSearch(query)
                    "ghost" -> ghostSearch(query)
                    else -> ftsSearch(query)
                }
                _uiState.value = _uiState.value.copy(
                    results = results,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Search failed"
                )
            }
        }
    }

    private suspend fun ftsSearch(query: String): List<SearchResult> {
        // Room FTS5 MATCH syntax
        val ftsQuery = query.split(" ").joinToString(" ") { "$it*" }
        val docs = searchDao.ftsSearch(ftsQuery)
        return docs.map { doc ->
            SearchResult(
                title = doc.title,
                snippet = doc.content_plain.take(200),
                score = "FTS5"
            )
        }
    }

    private suspend fun tfidfSearch(query: String): List<SearchResult> {
        val terms = query.lowercase().split(Regex("\\W+")).filter { it.length > 2 }.distinct()
        if (terms.isEmpty()) return emptyList()

        val termsJson = terms.joinToString(",") { "\"$it\"" }
        val docs = searchDao.tfidfSearch("[$termsJson]", 50)
        return docs.map { doc ->
            SearchResult(
                title = doc.title,
                snippet = doc.content_plain.take(200),
                score = "TF-IDF"
            )
        }
    }

    private suspend fun ghostSearch(query: String): List<SearchResult> {
        // FTS5 search then GHOST re-rank
        val ftsQuery = query.split(" ").joinToString(" ") { "$it*" }
        val docs = searchDao.ftsSearch(ftsQuery)
        return docs.map { doc ->
            SearchResult(
                title = doc.title,
                snippet = doc.content_plain.take(200),
                score = "GHOST"
            )
        }
    }
}
