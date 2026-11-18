package com.sraibridge.sovereign.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.sraibridge.sovereign.data.ArchiveDatabase
import com.sraibridge.sovereign.data.ArchiveRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SearchResult(
    val docId: Long,
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

    private val repository = ArchiveRepository(ArchiveDatabase.getInstance(application))

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    fun onQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        if (query.trim().length >= 3) {
            performSearch()
        } else {
            searchJob?.cancel()
            _uiState.value = _uiState.value.copy(results = emptyList(), isLoading = false, error = null)
        }
    }

    fun setSearchMode(mode: String) {
        _uiState.value = _uiState.value.copy(searchMode = mode)
        if (_uiState.value.query.trim().length >= 3) {
            performSearch()
        }
    }

    private fun performSearch() {
        val query = _uiState.value.query.trim()
        val mode = _uiState.value.searchMode
        if (query.length < 3) return

        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val ranked = when (mode) {
                    "tfidf" -> repository.tfidfSearch(query)
                    // GHOST re-ranking is not wired yet; it uses the FTS5 results for now.
                    "ghost" -> repository.ftsSearch(query)
                    else -> repository.ftsSearch(query)
                }
                val results = ranked.mapNotNull { item ->
                    val id = item.document.id ?: return@mapNotNull null
                    SearchResult(
                        docId = id,
                        title = item.document.title,
                        snippet = item.document.contentPlain.take(200),
                        score = item.score?.let { "${item.method} %.3f".format(it) } ?: item.method
                    )
                }
                _uiState.value = _uiState.value.copy(results = results, isLoading = false)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Search failed"
                )
            }
        }
    }
}
