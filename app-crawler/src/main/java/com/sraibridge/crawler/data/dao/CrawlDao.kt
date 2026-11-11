package com.sraibridge.crawler.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.sraibridge.crawler.data.entity.CrawlProgressEntity
import com.sraibridge.crawler.data.entity.IngestedDocumentEntity

@Dao
interface CrawlDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDocument(doc: IngestedDocumentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProgress(progress: CrawlProgressEntity)

    @Query("SELECT * FROM ingested_documents ORDER BY ingested_at DESC")
    suspend fun getAllDocuments(): List<IngestedDocumentEntity>

    @Query("SELECT * FROM ingested_documents WHERE sha3_512 = :sha3 LIMIT 1")
    suspend fun getDocumentByHash(sha3: String): IngestedDocumentEntity?

    @Query("SELECT COUNT(*) FROM ingested_documents")
    suspend fun documentCount(): Int

    @Query("SELECT * FROM crawl_progress WHERE source_name = :sourceName LIMIT 1")
    suspend fun getProgress(sourceName: String): CrawlProgressEntity?

    @Query("DELETE FROM ingested_documents")
    suspend fun clearAll()
}
