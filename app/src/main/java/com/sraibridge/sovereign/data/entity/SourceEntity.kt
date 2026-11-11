package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sources")
data class SourceEntity(
    @PrimaryKey
    @ColumnInfo(name = "source_id")
    val sourceId: String,
    @ColumnInfo(name = "drive_file_id")
    val driveFileId: String?,
    @ColumnInfo(name = "original_name")
    val originalName: String,
    @ColumnInfo(name = "mime_type")
    val mimeType: String?,
    @ColumnInfo(name = "modified_time")
    val modifiedTime: String?,
    @ColumnInfo(name = "extracted_account")
    val extractedAccount: String?,
    @ColumnInfo(name = "content_hash")
    val contentHash: String,
    @ColumnInfo(name = "extraction_status")
    val extractionStatus: String,
    @ColumnInfo(name = "extraction_note")
    val extractionNote: String?,
    @ColumnInfo(name = "ingested_at")
    val ingestedAt: String,
    @ColumnInfo(name = "seal_hash")
    val sealHash: String?
)