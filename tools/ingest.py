#!/usr/bin/env python3
"""
ingest.py — Sovereign Research Archive Corpus Extractor

Handles:
- PDF text extraction (PyMuPDF / pdfplumber)
- DOCX extraction (python-docx)
- HTML stripping
- Plaintext normalization
- SQLite FTS5 table creation with TF-IDF embeddings
- SHA3-512 content hashing for dedup
- A SHA3-512 seal chain: one seal per ingested document, binding its content hash
- Failed files recorded in ingest_failures with the reason, not omitted
- --verify: recompute every content hash and seal; non-zero exit on any mismatch

Usage:
  python3 tools/ingest.py --dir /path/to/files --db archive.db
  python3 tools/ingest.py --dir /path/to/files --db archive.db --dry-run
  python3 tools/ingest.py --verify --db archive.db
"""

import argparse
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

# Optional heavy dependencies — degrade gracefully
PDF_SUPPORT = False
DOCX_SUPPORT = False
try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    try:
        import pdfplumber
        PDF_SUPPORT = True
    except ImportError:
        pass

try:
    from docx import Document
    DOCX_SUPPORT = True
except ImportError:
    pass


class ExtractionError(Exception):
    """A file could not be turned into text; the reason is recorded in ingest_failures."""


class TextExtractor:
    """Extract plaintext from various file formats."""

    @staticmethod
    def extract(filepath: str) -> str:
        ext = Path(filepath).suffix.lower()
        try:
            if ext == ".pdf":
                return TextExtractor._extract_pdf(filepath)
            elif ext == ".docx":
                return TextExtractor._extract_docx(filepath)
            elif ext == ".doc":
                raise ExtractionError("legacy .doc is not supported; convert it to .docx or PDF")
            elif ext == ".html" or ext == ".htm":
                return TextExtractor._extract_html(filepath)
            else:
                return TextExtractor._read_text(filepath)
        except ExtractionError:
            raise
        except Exception as e:
            raise ExtractionError(f"{type(e).__name__}: {e}") from e

    @staticmethod
    def _read_text(filepath: str) -> str:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    @staticmethod
    def _extract_pdf(filepath: str) -> str:
        if not PDF_SUPPORT:
            raise ExtractionError("PDF extraction requires PyMuPDF or pdfplumber")
        if "fitz" in sys.modules:
            doc = fitz.open(filepath)
            text = "\n\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        with pdfplumber.open(filepath) as pdf:
            return "\n\n".join(page.extract_text() or "" for page in pdf.pages)

    @staticmethod
    def _extract_docx(filepath: str) -> str:
        if not DOCX_SUPPORT:
            raise ExtractionError("DOCX extraction requires python-docx")
        doc = Document(filepath)
        return "\n".join(p.text for p in doc.paragraphs)

    @staticmethod
    def _extract_html(filepath: str) -> str:
        raw = TextExtractor._read_text(filepath)
        # Remove scripts and styles
        raw = re.sub(r"<script[^>]*>.*?</script>", "", raw, flags=re.DOTALL | re.IGNORECASE)
        raw = re.sub(r"<style[^>]*>.*?</style>", "", raw, flags=re.DOTALL | re.IGNORECASE)
        raw = re.sub(r"<[^>]+>", " ", raw)
        raw = html.unescape(raw)
        raw = re.sub(r"\s+", " ", raw).strip()
        return raw


SEAL_FORMAT = "SRA-SEAL-1"


def seal_input(version: int, prev_hash: str, doc_sha3: str, created_at: int) -> str:
    """The exact string a seal hashes. Shared with src/research_index.js and --verify."""
    return f"{SEAL_FORMAT}|{version}|{prev_hash}|{doc_sha3}|{created_at}"


class CorpusIndex:
    """SQLite FTS5 index with TF-IDF term frequencies and a SHA3-512 seal chain.

    The schema is the contract the Android app's Room entities mirror
    (app/src/main/java/com/sraibridge/sovereign/data/entity). Change both together.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA page_size=65536")
        self.conn.execute("PRAGMA cache_size=-64000")
        self._create_tables()

    def _create_tables(self):
        c = self.conn.cursor()
        c.executescript("""
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
                description TEXT,
                doc_sha3 TEXT
            );

            CREATE TABLE IF NOT EXISTS ingest_failures (
                source_path TEXT PRIMARY KEY,
                reason TEXT NOT NULL,
                recorded_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_documents_sha3 ON documents(sha3_512);
            CREATE INDEX IF NOT EXISTS idx_term_frequencies_term ON term_frequencies(term);
            CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_path);
        """)
        # Databases created before doc_sha3 existed get the column added in place.
        columns = {row[1] for row in c.execute("PRAGMA table_info(merkle_seals)")}
        if "doc_sha3" not in columns:
            c.execute("ALTER TABLE merkle_seals ADD COLUMN doc_sha3 TEXT")
        self.conn.commit()

    def sha3(self, data: str) -> str:
        return hashlib.sha3_512(data.encode("utf-8")).hexdigest()

    def _build_term_frequencies(self, c, doc_id: int, text: str):
        terms = re.findall(r"[a-z0-9-]{3,}", text.lower())
        freq = {}
        for t in terms:
            freq[t] = freq.get(t, 0) + 1
        c.executemany(
            "INSERT OR REPLACE INTO term_frequencies (doc_id, term, freq) VALUES (?, ?, ?)",
            [(doc_id, term, count) for term, count in freq.items()],
        )

    def _update_corpus_stats(self, c, now_ms: int):
        doc_count = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        term_count = c.execute("SELECT COUNT(DISTINCT term) FROM term_frequencies").fetchone()[0]
        c.execute(
            "INSERT OR REPLACE INTO corpus_stats (id, total_docs, total_terms, last_updated) VALUES (1, ?, ?, ?)",
            (doc_count, term_count, now_ms),
        )

    def _create_seal(self, c, doc_sha3: str, description: str, now_ms: int) -> str:
        version = c.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM merkle_seals").fetchone()[0]
        prev = c.execute("SELECT seal_hash FROM merkle_seals ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = prev[0] if prev else "GENESIS"
        seal_hash = self.sha3(seal_input(version, prev_hash, doc_sha3, now_ms))
        c.execute(
            "INSERT INTO merkle_seals (version, seal_hash, created_at, description, doc_sha3) VALUES (?, ?, ?, ?, ?)",
            (version, seal_hash, now_ms, description, doc_sha3),
        )
        return seal_hash

    def ingest(self, title: str, source_path: str, content_text: str, content_plain: str, file_type: str) -> dict:
        """Add one document, its FTS row, term frequencies and seal in a single transaction."""
        sha3 = self.sha3(content_plain)
        word_count = len(content_plain.split())
        now_ms = int(time.time() * 1000)

        with self.conn:
            c = self.conn.cursor()
            existing = c.execute("SELECT id FROM documents WHERE sha3_512 = ?", (sha3,)).fetchone()
            c.execute("DELETE FROM ingest_failures WHERE source_path = ?", (source_path,))
            if existing:
                return {"deduped": True, "id": existing[0], "sha3": sha3}

            c.execute(
                """INSERT INTO documents (title, source_path, content_text, content_plain, sha3_512, file_type, ingested_at, word_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (title, source_path, content_text, content_plain, sha3, file_type, now_ms, word_count),
            )
            doc_id = c.lastrowid
            c.execute(
                "INSERT INTO documents_fts (rowid, title, content_plain, content_text) VALUES (?, ?, ?, ?)",
                (doc_id, title, content_plain, content_text),
            )
            self._build_term_frequencies(c, doc_id, content_plain)
            self._update_corpus_stats(c, now_ms)
            seal = self._create_seal(c, sha3, f"Ingested: {title}", now_ms)

        return {"deduped": False, "id": doc_id, "sha3": sha3, "word_count": word_count, "seal": seal}

    def record_failure(self, source_path: str, reason: str):
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO ingest_failures (source_path, reason, recorded_at) VALUES (?, ?, ?)",
                (source_path, reason, int(time.time() * 1000)),
            )

    def verify(self) -> list:
        """Recompute every content hash and every seal. Returns a list of problems (empty = OK)."""
        problems = []
        c = self.conn.cursor()

        docs = {}
        for doc_id, content_plain, stored in c.execute("SELECT id, content_plain, sha3_512 FROM documents"):
            if self.sha3(content_plain) != stored:
                problems.append(f"document {doc_id}: content does not match its sha3_512")
            docs[stored] = doc_id

        prev_hash = "GENESIS"
        sealed = set()
        expected_version = 1
        for seal_id, version, seal_hash, created_at, doc_sha3 in c.execute(
            "SELECT id, version, seal_hash, created_at, doc_sha3 FROM merkle_seals ORDER BY id ASC"
        ):
            if version != expected_version:
                problems.append(f"seal {seal_id}: version {version}, expected {expected_version}")
            if doc_sha3 is None:
                problems.append(f"seal {seal_id}: no doc_sha3 (written by an older ingest, cannot be verified)")
            elif self.sha3(seal_input(version, prev_hash, doc_sha3, created_at)) != seal_hash:
                problems.append(f"seal {seal_id}: hash does not match its inputs (chain broken here)")
            if doc_sha3 is not None:
                if doc_sha3 not in docs:
                    problems.append(f"seal {seal_id}: sealed document is missing")
                sealed.add(doc_sha3)
            prev_hash = seal_hash
            expected_version = version + 1

        for sha3, doc_id in docs.items():
            if sha3 not in sealed:
                problems.append(f"document {doc_id}: has no seal")

        try:
            c.execute("INSERT INTO documents_fts(documents_fts) VALUES('integrity-check')")
        except sqlite3.DatabaseError as e:
            problems.append(f"documents_fts: integrity check failed ({e})")
        self.conn.rollback()

        stats = c.execute("SELECT total_docs FROM corpus_stats WHERE id = 1").fetchone()
        if docs and (stats is None or stats[0] != len(docs)):
            problems.append(f"corpus_stats.total_docs is {stats[0] if stats else 'missing'}, expected {len(docs)}")
        return problems

    def root_seal(self):
        row = self.conn.execute("SELECT seal_hash FROM merkle_seals ORDER BY id DESC LIMIT 1").fetchone()
        return row[0] if row else None

    def fts_search(self, query: str, limit: int = 50) -> list:
        # Quote each token so punctuation (c++, e-mail, quotes) cannot break FTS5 syntax.
        tokens = [t.replace('"', "") for t in query.split()]
        fts_query = " ".join(f'"{t}"*' for t in tokens if t)
        if not fts_query:
            return []
        c = self.conn.cursor()
        c.execute(
            """SELECT d.id, d.title, d.content_plain, d.sha3_512, d.source_path, rank
               FROM documents_fts
               JOIN documents d ON d.id = documents_fts.rowid
               WHERE documents_fts MATCH ?
               ORDER BY rank
               LIMIT ?""",
            (fts_query, limit)
        )
        return c.fetchall()

    def tfidf_search(self, query: str, limit: int = 50) -> list:
        terms = re.findall(r"[a-z0-9-]{3,}", query.lower())
        if not terms:
            return []

        c = self.conn.cursor()
        total_docs = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        if total_docs == 0:
            return []

        placeholders = ",".join("?" for _ in terms)
        sql = f"""
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
                    (LOG(CAST(? AS REAL) /
                        (SELECT CAST(COUNT(DISTINCT doc_id) AS REAL)
                         FROM term_frequencies t3 WHERE t3.term = tf.term)
                    ))
                ) AS score
            FROM term_frequencies tf
            JOIN documents d ON d.id = tf.doc_id
            WHERE tf.term IN ({placeholders})
            GROUP BY tf.doc_id
            ORDER BY score DESC
            LIMIT ?
        """
        c.execute(sql, [total_docs] + terms + [limit])
        return c.fetchall()

    def stats(self) -> dict:
        c = self.conn.cursor()
        doc_count = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        term_count = c.execute("SELECT COUNT(DISTINCT term) FROM term_frequencies").fetchone()[0]
        seal = c.execute("SELECT * FROM merkle_seals ORDER BY id DESC LIMIT 1").fetchone()
        failures = c.execute("SELECT COUNT(*) FROM ingest_failures").fetchone()[0]
        return {
            "documentCount": doc_count,
            "uniqueTerms": term_count,
            "recordedFailures": failures,
            "lastSeal": seal
        }

    def merkle_chain(self) -> list:
        c = self.conn.cursor()
        return c.execute("SELECT * FROM merkle_seals ORDER BY id ASC").fetchall()

    def close(self):
        self.conn.close()


def scan_directory(dir_path: str, recursive: bool = True) -> list:
    """Scan directory for supported files, return list of file paths."""
    supported = {".pdf", ".docx", ".doc", ".txt", ".md", ".html", ".htm", ".csv", ".json", ".xml", ".yaml", ".yml", ".toml"}
    files = []
    if recursive:
        for root, _, filenames in os.walk(dir_path):
            for fn in filenames:
                ext = Path(fn).suffix.lower()
                if ext in supported:
                    files.append(os.path.join(root, fn))
    else:
        for fn in os.listdir(dir_path):
            fp = os.path.join(dir_path, fn)
            if os.path.isfile(fp):
                ext = Path(fn).suffix.lower()
                if ext in supported:
                    files.append(fp)
    return sorted(files)


def main():
    parser = argparse.ArgumentParser(description="Sovereign Research Archive Corpus Extractor")
    parser.add_argument("--dir", help="Directory of research files to ingest")
    parser.add_argument("--db", default="archive.db", help="SQLite database path (build_apk.sh ships archive.db)")
    parser.add_argument("--dry-run", action="store_true", help="Scan and report only, no DB write")
    parser.add_argument("--watch", help="Not implemented; rejected with an error")
    parser.add_argument("--search", help="Search the index (FTS5)")
    parser.add_argument("--tfidf", help="Search the index (TF-IDF)")
    parser.add_argument("--stats", action="store_true", help="Show index statistics")
    parser.add_argument("--merkle", action="store_true", help="Show the seal chain")
    parser.add_argument("--verify", action="store_true",
                        help="Recompute content hashes and the seal chain; exit 1 on any mismatch")
    parser.add_argument("--strict", action="store_true",
                        help="With --dir: exit 1 if any file failed to ingest")
    args = parser.parse_args()

    if args.watch:
        print("--watch is not implemented. Re-run with --dir after adding files.", file=sys.stderr)
        sys.exit(2)

    if args.verify:
        if not os.path.exists(args.db):
            print(f"Index not found: {args.db}", file=sys.stderr)
            sys.exit(1)
        idx = CorpusIndex(args.db)
        problems = idx.verify()
        doc_count = idx.stats()["documentCount"]
        root = idx.root_seal()
        idx.close()
        if problems:
            print(f"VERIFY FAILED: {len(problems)} problem(s) in {args.db}")
            for p in problems[:50]:
                print(f"  - {p}")
            sys.exit(1)
        print(f"VERIFY OK: {doc_count} documents, every content hash and seal recomputed.")
        print(f"  Root seal: {root or '(empty archive)'}")
        return

    if args.search or args.tfidf:
        if not os.path.exists(args.db):
            print(f"Index not found: {args.db}", file=sys.stderr)
            sys.exit(1)
        idx = CorpusIndex(args.db)
        mode = "tfidf" if args.tfidf else "fts"
        query = args.tfidf or args.search
        results = idx.tfidf_search(query) if mode == "tfidf" else idx.fts_search(query)
        print(f"Found {len(results)} results for '{query}' ({mode}):")
        for r in results[:20]:
            print(f"  {r[0]}. {r[1]} [{r[5] if len(r) > 5 else 'N/A'}]")
        idx.close()
        return

    if args.stats:
        if not os.path.exists(args.db):
            print(f"Index not found: {args.db}", file=sys.stderr)
            sys.exit(1)
        idx = CorpusIndex(args.db)
        print(json.dumps(idx.stats(), default=str, indent=2))
        idx.close()
        return

    if args.merkle:
        if not os.path.exists(args.db):
            print(f"Index not found: {args.db}", file=sys.stderr)
            sys.exit(1)
        idx = CorpusIndex(args.db)
        chain = idx.merkle_chain()
        print(f"Merkle seal chain ({len(chain)} seals):")
        for s in chain:
            print(f"  v{s[1]}: {s[2][:16]}... ({s[4]})")
        idx.close()
        return

    if not args.dir:
        parser.print_help()
        sys.exit(1)

    # Ingest mode
    files = scan_directory(args.dir)
    print(f"Found {len(files)} files in {args.dir}")

    if args.dry_run:
        print("\nDRY RUN — no files written")
        for f in files:
            ext = Path(f).suffix
            print(f"  {ext:6s} {f}")
        return

    idx = CorpusIndex(args.db)
    ingested = 0
    deduped = 0
    failed = 0

    for fp in files:
        rel = os.path.relpath(fp, args.dir)
        print(f"[{ingested + deduped + failed + 1}/{len(files)}] {rel}...", end=" ", flush=True)

        try:
            text = TextExtractor.extract(fp)
            if not text.strip():
                idx.record_failure(rel, "no text extracted")
                print("FAIL: no text extracted (recorded)")
                failed += 1
                continue

            title = Path(fp).stem
            file_type = Path(fp).suffix.lstrip(".")

            result = idx.ingest(
                title=title,
                source_path=rel,
                content_text=text,
                content_plain=text,
                file_type=file_type
            )

            if result["deduped"]:
                print("DEDUP")
                deduped += 1
            else:
                print(f"OK ({result.get('word_count', 0)} words, seal: {result.get('seal', '')[:12]}...)")
                ingested += 1

        except Exception as e:
            idx.record_failure(rel, str(e))
            print(f"FAIL: {e} (recorded)")
            failed += 1

    idx.close()

    print(f"\nIngestion complete.")
    print(f"  Ingested: {ingested}")
    print(f"  Deduped:  {deduped}")
    print(f"  Failed:   {failed}")
    print(f"  Database: {args.db}")

    # Show stats
    idx2 = CorpusIndex(args.db)
    stats = idx2.stats()
    print(f"  Total docs: {stats['documentCount']}")
    print(f"  Unique terms: {stats['uniqueTerms']}")
    print(f"  Recorded failures: {stats['recordedFailures']} (see table ingest_failures)")
    idx2.close()

    if args.strict and failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
