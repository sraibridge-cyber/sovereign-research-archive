package com.sraibridge.crawler.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.sraibridge.crawler.data.dao.CrawlDao
import com.sraibridge.crawler.data.entity.CrawlProgressEntity
import com.sraibridge.crawler.data.entity.IngestedDocumentEntity

@Database(
    entities = [IngestedDocumentEntity::class, CrawlProgressEntity::class],
    version = 1,
    exportSchema = false
)
abstract class CrawlDatabase : RoomDatabase() {
    abstract fun crawlDao(): CrawlDao

    companion object {
        @Volatile
        private var INSTANCE: CrawlDatabase? = null

        fun getInstance(context: Context): CrawlDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): CrawlDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                CrawlDatabase::class.java,
                "crawl_cache.db"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
