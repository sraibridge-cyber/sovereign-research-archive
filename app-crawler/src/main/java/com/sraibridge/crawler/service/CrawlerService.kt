package com.sraibridge.crawler.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.sraibridge.crawler.data.CrawlDatabase
import com.sraibridge.crawler.data.TextExtractor
import com.sraibridge.crawler.data.entity.CrawlProgressEntity
import com.sraibridge.crawler.data.entity.IngestedDocumentEntity
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Foreground service that crawls Google Drive via the Drive API,
 * extracts text from every file, and builds the search index.
 *
 * Requires the user to authenticate via OAuth (handled by the activity).
 */
class CrawlerService : Service() {

    companion object {
        private const val TAG = "CrawlerService"
        private const val DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
        private const val PAGE_SIZE = 100
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var db: CrawlDatabase

    override fun onCreate() {
        super.onCreate()
        db = CrawlDatabase.getInstance(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val accessToken = intent?.getStringExtra("ACCESS_TOKEN") ?: return START_NOT_STICKY
        val folderId = intent?.getStringExtra("FOLDER_ID")

        serviceScope.launch {
            crawlDrive(accessToken, folderId)
            stopSelf()
        }

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private suspend fun crawlDrive(accessToken: String, folderId: String?) {
        var pageToken: String? = null
        var totalIngested = 0
        var totalFailed = 0

        try {
            updateProgress("drive", 0, 0, 0, null, "RUNNING")

            do {
                val url = buildQueryUrl(folderId, pageToken)
                val response = driveApiGet(url, accessToken)
                val json = JSONObject(response)
                val files = json.getJSONArray("files")

                for (i in 0 until files.length()) {
                    val file = files.getJSONObject(i)
                    val fileId = file.getString("id")
                    val fileName = file.getString("name")
                    val mimeType = file.getString("mimeType")

                    // Skip folders and Google-native formats we can't export
                    if (mimeType == "application/vnd.google-apps.folder") continue
                    if (mimeType.startsWith("application/vnd.google-apps")) {
                        // Export Google Docs/Sheets/Slides
                        ingestGoogleDoc(accessToken, fileId, fileName, mimeType)
                        totalIngested++
                        continue
                    }

                    // Download and extract
                    val result = downloadAndExtract(accessToken, fileId, fileName, mimeType)
                    if (result != null) {
                        val entity = IngestedDocumentEntity(
                            drive_file_id = fileId,
                            title = result.title,
                            mime_type = mimeType,
                            file_extension = result.fileType,
                            content_plain = result.contentPlain,
                            sha3_512 = result.sha3_512,
                            ingested_at = System.currentTimeMillis(),
                            word_count = result.wordCount
                        )
                        db.crawlDao().insertDocument(entity)
                        totalIngested++
                    } else {
                        totalFailed++
                    }

                    updateProgress(
                        "drive",
                        files.length(),
                        totalIngested,
                        totalFailed,
                        fileName,
                        "RUNNING"
                    )
                }

                pageToken = json.optString("nextPageToken", null)
            } while (pageToken != null)

            updateProgress(
                "drive", totalIngested + totalFailed,
                totalIngested, totalFailed, null,
                if (totalFailed > 0) "COMPLETED_WITH_ERRORS" else "COMPLETED"
            )

            Log.i(TAG, "Crawl complete: $totalIngested ingested, $totalFailed failed")
        } catch (e: Exception) {
            Log.e(TAG, "Crawl failed", e)
            updateProgress("drive", totalIngested + totalFailed, totalIngested, totalFailed, null, "FAILED")
        }
    }

    private fun buildQueryUrl(folderId: String?, pageToken: String?): String {
        val sb = StringBuilder("$DRIVE_FILES_URL?pageSize=$PAGE_SIZE")
        sb.append("&fields=files(id,name,mimeType,size,modifiedTime),nextPageToken")

        val queryParts = mutableListOf("trashed = false")
        if (folderId != null) {
            queryParts.add("'$folderId' in parents")
        }
        sb.append("&q=${java.net.URLEncoder.encode(queryParts.joinToString(" and"), "UTF-8")}")

        if (pageToken != null) {
            sb.append("&pageToken=$pageToken")
        }
        return sb.toString()
    }

    private fun driveApiGet(urlString: String, accessToken: String): String {
        val url = URL(urlString)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.setRequestProperty("Authorization", "Bearer $accessToken")
        conn.setRequestProperty("Accept", "application/json")
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun driveApiDownload(fileId: String, accessToken: String): ByteArray {
        val url = URL("$DRIVE_FILES_URL/$fileId?alt=media")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.setRequestProperty("Authorization", "Bearer $accessToken")
        return conn.inputStream.readBytes()
    }

    private suspend fun downloadAndExtract(
        accessToken: String,
        fileId: String,
        fileName: String,
        mimeType: String
    ): TextExtractor.ExtractedDocument? {
        return withContext(Dispatchers.IO) {
            try {
                val bytes = driveApiDownload(fileId, accessToken)
                TextExtractor.extract(bytes, fileName, mimeType)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download/extract $fileName", e)
                null
            }
        }
    }

    private suspend fun ingestGoogleDoc(
        accessToken: String,
        fileId: String,
        fileName: String,
        mimeType: String
    ) {
        withContext(Dispatchers.IO) {
            try {
                // Export as plain text
                val exportMime = when {
                    mimeType.contains("document") -> "text/plain"
                    mimeType.contains("spreadsheet") -> "text/csv"
                    mimeType.contains("presentation") -> "text/plain"
                    else -> return@withContext
                }
                val url = URL("https://www.googleapis.com/drive/v3/files/$fileId/export?mimeType=$exportMime")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Authorization", "Bearer $accessToken")
                val text = conn.inputStream.bufferedReader().use { it.readText() }
                val sha3 = TextExtractor.sha3_512(text.toByteArray())

                val entity = IngestedDocumentEntity(
                    drive_file_id = fileId,
                    title = fileName.substringBeforeLast("."),
                    mime_type = mimeType,
                    file_extension = when {
                        mimeType.contains("document") -> "gdoc"
                        mimeType.contains("spreadsheet") -> "gsheet"
                        mimeType.contains("presentation") -> "gslides"
                        else -> "gdoc"
                    },
                    content_plain = text,
                    sha3_512 = sha3,
                    ingested_at = System.currentTimeMillis(),
                    word_count = text.split(Regex("\\s+")).size
                )
                db.crawlDao().insertDocument(entity)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to export Google doc $fileName", e)
            }
        }
    }

    private suspend fun updateProgress(
        sourceName: String,
        total: Int,
        ingested: Int,
        failed: Int,
        lastFile: String?,
        status: String
    ) {
        withContext(Dispatchers.IO) {
            db.crawlDao().upsertProgress(
                CrawlProgressEntity(
                    source_name = sourceName,
                    total_files = total,
                    ingested_files = ingested,
                    failed_files = failed,
                    last_file_processed = lastFile,
                    last_activity = System.currentTimeMillis(),
                    status = status
                )
            )
        }
    }
}
