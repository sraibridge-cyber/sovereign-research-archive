package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/** Mirrors the `term_frequencies` table from src/research_index.js. */
@Entity(
    tableName = "term_frequencies",
    primaryKeys = ["doc_id", "term"],
    foreignKeys = [
        ForeignKey(
            entity = DocumentEntity::class,
            parentColumns = ["id"],
            childColumns = ["doc_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["term"], name = "idx_term_frequencies_term")]
)
data class TermFrequencyEntity(
    @ColumnInfo(name = "doc_id")
    val docId: Long,
    val term: String,
    val freq: Int
)
