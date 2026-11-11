package com.sraibridge.sovereign.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "corpus_stats")
data class CorpusMetaEntity(
    @PrimaryKey val id: Int = 1,
    val total_docs: Int,
    val total_terms: Int,
    val last_updated: Long
)
