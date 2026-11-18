package com.sraibridge.sovereign.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.sraibridge.sovereign.data.ArchiveDatabase
import com.sraibridge.sovereign.data.ArchiveRepository
import com.sraibridge.sovereign.data.entity.DocumentEntity

private sealed interface DocumentLoad {
    object Loading : DocumentLoad
    data class Loaded(val document: DocumentEntity) : DocumentLoad
    object NotFound : DocumentLoad
    data class Failed(val message: String) : DocumentLoad
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentDetailScreen(
    docId: Long,
    onBack: () -> Unit
) {
    val context = LocalContext.current.applicationContext
    val load by produceState<DocumentLoad>(DocumentLoad.Loading, docId) {
        value = try {
            val repository = ArchiveRepository(ArchiveDatabase.getInstance(context))
            repository.getDocument(docId)?.let { DocumentLoad.Loaded(it) } ?: DocumentLoad.NotFound
        } catch (e: Exception) {
            DocumentLoad.Failed(e.message ?: "Could not load document")
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Document") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            when (val current = load) {
                DocumentLoad.Loading -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                DocumentLoad.NotFound -> Text("Document $docId is not in the local archive.")
                is DocumentLoad.Failed -> Text(
                    text = "Could not load document: ${current.message}",
                    color = MaterialTheme.colorScheme.error
                )
                is DocumentLoad.Loaded -> DocumentBody(current.document)
            }
        }
    }
}

@Composable
private fun DocumentBody(document: DocumentEntity) {
    Text(
        text = document.title,
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = "${document.fileType} \u00b7 ${document.wordCount} words \u00b7 ${document.sourcePath}",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = "SHA3-512 (as indexed): ${document.sha3512}",
        style = MaterialTheme.typography.labelSmall,
        fontFamily = FontFamily.Monospace,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(modifier = Modifier.height(16.dp))
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = document.contentPlain,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp)
        )
    }
}
