package com.sraibridge.sovereign.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "corpus_meta")
data class CorpusMetaEntity(
    @PrimaryKey
    val key: String,
    val value: String
)