package com.sraibridge.crawler.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "crawl_progress")
data class CrawlProgressEntity(
    @PrimaryKey val source_name: String,
    val total_files: Int,
    val ingested_files: Int,
    val failed_files: Int,
    val last_file_processed: String?,
    val last_activity: Long,
    val status: String  // RUNNING, COMPLETED, FAILED
)
