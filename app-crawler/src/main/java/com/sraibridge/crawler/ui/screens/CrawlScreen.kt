package com.sraibridge.crawler.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.sraibridge.crawler.service.CrawlerService

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CrawlScreen() {
    val context = LocalContext.current
    var status by remember { mutableStateOf("Ready") }
    var progress by remember { mutableStateOf("0 / 0") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Research Archive Crawler",
            style = MaterialTheme.typography.headlineMedium
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Status: $status")
                Spacer(modifier = Modifier.height(8.dp))
                Text("Progress: $progress")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = {
                status = "Running..."
                val intent = Intent(context, CrawlerService::class.java).apply {
                    putExtra("ACCESS_TOKEN", "FROM_OAUTH")
                }
                context.startService(intent)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Start Crawl")
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedButton(
            onClick = {
                status = "Ready"
                progress = "0 / 0"
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Reset")
        }
    }
}
