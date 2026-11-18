package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Mirrors the `documents` table that src/research_index.js creates in archive.db.
 * Column names, types, nullability and index names must match it exactly, or Room
 * rejects the prebuilt database when it opens it.
 *
 * `id` is nullable because the Node schema declares `id INTEGER PRIMARY KEY AUTOINCREMENT`
 * without NOT NULL; a non-null Kotlin type would make Room expect NOT NULL.
 */
@Entity(
    tableName = "documents",
    indices = [
        Index(value = ["sha3_512"], name = "idx_documents_sha3"),
        Index(value = ["source_path"], name = "idx_documents_source")
    ]
)
data class DocumentEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long? = null,
    val title: String,
    @ColumnInfo(name = "source_path")
    val sourcePath: String,
    @ColumnInfo(name = "content_text")
    val contentText: String,
    @ColumnInfo(name = "content_plain")
    val contentPlain: String,
    @ColumnInfo(name = "sha3_512")
    val sha3512: String,
    @ColumnInfo(name = "file_type")
    val fileType: String,
    @ColumnInfo(name = "ingested_at")
    val ingestedAt: Long,
    @ColumnInfo(name = "word_count")
    val wordCount: Int
)
