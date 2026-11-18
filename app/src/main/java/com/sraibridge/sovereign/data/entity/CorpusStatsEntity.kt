package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Mirrors the single-row `corpus_stats` table from src/research_index.js.
 *
 * The Node schema declares `id INTEGER PRIMARY KEY DEFAULT 1` without NOT NULL. Room only
 * allows a nullable primary key when it is auto-generated, so the key is declared that way;
 * the indexer always writes row id 1.
 */
@Entity(tableName = "corpus_stats")
data class CorpusStatsEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int? = 1,
    @ColumnInfo(name = "total_docs")
    val totalDocs: Int,
    @ColumnInfo(name = "total_terms")
    val totalTerms: Int,
    @ColumnInfo(name = "last_updated")
    val lastUpdated: Long
)
