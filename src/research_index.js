// research_index.js — Sovereign Research Archive Ingestion Orchestrator
// Builds FTS5 + TF-IDF search database from ingested documents
// SHA3-512 Merkle seals on every write

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ResearchIndex {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(process.cwd(), 'research_index.db');
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        const Database = (await import('better-sqlite3')).default;
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('page_size = 65536');
        this.db.pragma('cache_size = -64000');

        this._createTables();
        this.initialized = true;
    }

    _createTables() {
        this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                title,
                content_plain,
                content_text,
                tokenize='porter unicode61',
                content='documents',
                content_rowid='rowid'
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                source_path TEXT NOT NULL,
                content_text TEXT NOT NULL DEFAULT '',
                content_plain TEXT NOT NULL DEFAULT '',
                sha3_512 TEXT NOT NULL UNIQUE,
                file_type TEXT NOT NULL DEFAULT 'txt',
                ingested_at INTEGER NOT NULL,
                word_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS term_frequencies (
                doc_id INTEGER NOT NULL,
                term TEXT NOT NULL,
                freq INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (doc_id, term),
                FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS corpus_stats (
                id INTEGER PRIMARY KEY DEFAULT 1,
                total_docs INTEGER NOT NULL DEFAULT 0,
                total_terms INTEGER NOT NULL DEFAULT 0,
                last_updated INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS merkle_seals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                seal_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                description TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_documents_sha3 ON documents(sha3_512);
            CREATE INDEX IF NOT EXISTS idx_term_frequencies_term ON term_frequencies(term);
            CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_path);
        `);
    }

    sha3(data) {
        return crypto.createHash('sha3-512').update(data).digest('hex');
    }

    ingestDocument(title, sourcePath, contentText, contentPlain, fileType, ingestedAt) {
        if (!this.initialized) throw new Error('ResearchIndex not initialized');

        const sha3 = this.sha3(contentPlain);
        const wordCount = contentPlain.split(/\s+/).filter(w => w.length > 0).length;

        const existing = this.db.prepare('SELECT id FROM documents WHERE sha3_512 = ?').get(sha3);
        if (existing) {
            return { deduped: true, id: existing.id, sha3 };
        }

        const insert = this.db.prepare(`
            INSERT INTO documents (title, source_path, content_text, content_plain, sha3_512, file_type, ingested_at, word_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insert.run(title, sourcePath, contentText, contentPlain, sha3, fileType, ingestedAt, wordCount);
        const docId = result.lastInsertRowid;

        // Build term frequencies for TF-IDF
        this._buildTermFrequencies(docId, contentPlain);

        // Update FTS5 index
        this.db.prepare(`
            INSERT INTO documents_fts (rowid, title, content_plain, content_text)
            VALUES (?, ?, ?, ?)
        `).run(docId, title, contentPlain, contentText);

        // Update corpus stats
        this._updateCorpusStats();

        // Create Merkle seal
        this._createSeal(`Ingested: ${title}`);

        return { deduped: false, id: docId, sha3, wordCount };
    }

    _buildTermFrequencies(docId, text) {
        const terms = text.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);

        const freqMap = new Map();
        for (const term of terms) {
            freqMap.set(term, (freqMap.get(term) || 0) + 1);
        }

        const insert = this.db.prepare('INSERT OR REPLACE INTO term_frequencies (doc_id, term, freq) VALUES (?, ?, ?)');
        const batch = this.db.transaction((entries) => {
            for (const [term, freq] of entries) {
                insert.run(docId, term, freq);
            }
        });

        batch([...freqMap.entries()]);
    }

    _updateCorpusStats() {
        const docCount = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get();
        const termCount = this.db.prepare('SELECT COUNT(DISTINCT term) AS count FROM term_frequencies').get();
        this.db.prepare(`
            INSERT OR REPLACE INTO corpus_stats (id, total_docs, total_terms, last_updated)
            VALUES (1, ?, ?, ?)
        `).run(docCount.count, termCount.count, Date.now());
    }

    _createSeal(description) {
        const version = (this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM merkle_seals').get()?.v) || 1;
        const prevSeal = this.db.prepare('SELECT seal_hash FROM merkle_seals ORDER BY id DESC LIMIT 1').get();
        const docCount = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
        const sealData = `v${version}|${prevSeal?.seal_hash || 'GENESIS'}|${docCount}|${description}|${Date.now()}`;
        const sealHash = this.sha3(sealData);

        this.db.prepare(`
            INSERT INTO merkle_seals (version, seal_hash, created_at, description)
            VALUES (?, ?, ?, ?)
        `).run(version, sealHash, Date.now(), description);

        return sealHash;
    }

    // --- Search ---

    ftsSearch(query, limit = 50) {
        if (!this.initialized) throw new Error('ResearchIndex not initialized');
        const ftsQuery = query.split(/\s+/).map(t => `${t}*`).join(' ');
        return this.db.prepare(`
            SELECT d.*, rank
            FROM documents_fts
            JOIN documents d ON d.id = documents_fts.rowid
            WHERE documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        `).all(ftsQuery, limit);
    }

    tfidfSearch(query, limit = 50) {
        if (!this.initialized) throw new Error('ResearchIndex not initialized');

        const terms = query.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);

        if (terms.length === 0) return [];

        const totalDocs = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;

        const placeholders = terms.map(() => '?').join(',');
        const results = this.db.prepare(`
            SELECT
                tf.doc_id,
                d.title,
                d.content_plain,
                d.sha3_512,
                d.source_path,
                SUM(
                    (CAST(tf.freq AS REAL) /
                        (SELECT MAX(freq) FROM term_frequencies t2 WHERE t2.doc_id = tf.doc_id)
                    ) *
                    LOG(CAST(? AS REAL) /
                        (SELECT CAST(COUNT(DISTINCT doc_id) AS REAL)
                         FROM term_frequencies t3 WHERE t3.term = tf.term)
                    )
                ) AS score
            FROM term_frequencies tf
            JOIN documents d ON d.id = tf.doc_id
            WHERE tf.term IN (${placeholders})
            GROUP BY tf.doc_id
            ORDER BY score DESC
            LIMIT ?
        `).all(totalDocs, ...terms, limit);

        return results;
    }

    getStats() {
        if (!this.initialized) return null;
        const docCount = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
        const termCount = this.db.prepare('SELECT COUNT(DISTINCT term) AS count FROM term_frequencies').get().count;
        const lastSeal = this.db.prepare('SELECT * FROM merkle_seals ORDER BY id DESC LIMIT 1').get();
        const corpusStats = this.db.prepare('SELECT * FROM corpus_stats WHERE id = 1').get();

        return {
            documentCount: docCount,
            uniqueTerms: termCount,
            lastSeal,
            corpusStats
        };
    }

    getMerkleChain() {
        return this.db.prepare('SELECT * FROM merkle_seals ORDER BY id ASC').all();
    }

    close() {
        if (this.db) {
            this.db.close();
            this.initialized = false;
        }
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'build') {
        const indexPath = args[1] || 'research_index.db';
        const index = new ResearchIndex(indexPath);
        index.initialize().then(() => {
            console.log('Research index initialized at:', indexPath);
            console.log('Stats:', JSON.stringify(index.getStats(), null, 2));
            index.close();
        }).catch(err => {
            console.error('Failed:', err);
            process.exit(1);
        });
    } else if (command === 'search') {
        const query = args[1];
        const mode = args[2] || 'fts';
        const indexPath = args[3] || 'research_index.db';

        if (!query) {
            console.error('Usage: node research_index.js search <query> [fts|tfidf] [db_path]');
            process.exit(1);
        }

        const index = new ResearchIndex(indexPath);
        index.initialize().then(() => {
            const results = mode === 'tfidf' ? index.tfidfSearch(query) : index.ftsSearch(query);
            console.log(`Found ${results.length} results for "${query}" (${mode}):`);
            results.forEach((r, i) => {
                console.log(`  ${i + 1}. ${r.title} [score: ${r.rank || r.score}]`);
            });
            index.close();
        }).catch(err => {
            console.error('Failed:', err);
            process.exit(1);
        });
    } else if (command === 'stats') {
        const indexPath = args[1] || 'research_index.db';
        const index = new ResearchIndex(indexPath);
        index.initialize().then(() => {
            console.log(JSON.stringify(index.getStats(), null, 2));
            index.close();
        }).catch(err => {
            console.error('Failed:', err);
            process.exit(1);
        });
    } else {
        console.log(`
Usage:
  node research_index.js build [db_path]
  node research_index.js search <query> [fts|tfidf] [db_path]
  node research_index.js stats [db_path]
        `);
    }
}

module.exports = ResearchIndex;
