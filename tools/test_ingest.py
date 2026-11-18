"""Tests for tools/ingest.py: ingestion, failure recording and seal verification.

Run from the repository root:  python3 -m unittest discover -s tools -v
(pytest also collects these: cd tools && python -m pytest)
"""

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest  # noqa: E402

INGEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ingest.py")


def run_cli(*args):
    return subprocess.run([sys.executable, INGEST, *args], capture_output=True, text=True)


class IngestTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.corpus = root / "corpus"
        self.corpus.mkdir()
        (self.corpus / "cc.txt").write_text("Coherence Calculus uses a weighted geometric mean.\n")
        (self.corpus / "cc_copy.txt").write_text("Coherence Calculus uses a weighted geometric mean.\n")
        (self.corpus / "ghost.md").write_text("# GHOST\nThe GHOST kernel gates coherence.\n")
        (self.corpus / "w.html").write_text("<p>W(n) = (n + 3i) / 17 &amp; maturity</p><script>x()</script>")
        (self.corpus / "empty.txt").write_text("")
        (self.corpus / "old.doc").write_bytes(b"\xd0\xcf\x11\xe0 legacy")
        self.db = str(root / "archive.db")

    def tearDown(self):
        self.tmp.cleanup()

    def ingest_corpus(self):
        result = run_cli("--dir", str(self.corpus), "--db", self.db)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def query(self, sql, params=()):
        conn = sqlite3.connect(self.db)
        try:
            return conn.execute(sql, params).fetchall()
        finally:
            conn.close()

    def execute(self, sql, params=()):
        conn = sqlite3.connect(self.db)
        try:
            conn.execute(sql, params)
            conn.commit()
        finally:
            conn.close()


class TestIngestion(IngestTestCase):
    def test_documents_are_ingested_and_deduplicated(self):
        out = self.ingest_corpus().stdout
        self.assertIn("Ingested: 3", out)
        self.assertIn("Deduped:  1", out)
        self.assertEqual(self.query("SELECT COUNT(*) FROM documents")[0][0], 3)
        self.assertEqual(self.query("SELECT COUNT(*) FROM merkle_seals")[0][0], 3)
        self.assertEqual(self.query("SELECT total_docs FROM corpus_stats WHERE id = 1")[0][0], 3)

    def test_failures_are_recorded_not_omitted(self):
        self.ingest_corpus()
        failures = dict(self.query("SELECT source_path, reason FROM ingest_failures"))
        self.assertEqual(failures["empty.txt"], "no text extracted")
        self.assertIn("legacy .doc", failures["old.doc"])

    def test_failure_is_cleared_when_the_file_later_ingests(self):
        self.ingest_corpus()
        (self.corpus / "empty.txt").write_text("Now it has text about tesseract memory.\n")
        self.ingest_corpus()
        paths = [row[0] for row in self.query("SELECT source_path FROM ingest_failures")]
        self.assertNotIn("empty.txt", paths)

    @unittest.skipIf(ingest.PDF_SUPPORT, "PDF library installed")
    def test_pdf_without_library_is_a_failure_not_placeholder_text(self):
        (self.corpus / "paper.pdf").write_bytes(b"%PDF-1.4 minimal")
        self.ingest_corpus()
        failures = dict(self.query("SELECT source_path, reason FROM ingest_failures"))
        self.assertIn("PyMuPDF", failures["paper.pdf"])
        self.assertEqual(self.query("SELECT COUNT(*) FROM documents WHERE content_plain LIKE '%PyMuPDF%'")[0][0], 0)

    def test_strict_exits_nonzero_when_files_fail(self):
        result = run_cli("--dir", str(self.corpus), "--db", self.db, "--strict")
        self.assertEqual(result.returncode, 1)

    def test_fts_query_with_punctuation_does_not_raise(self):
        self.ingest_corpus()
        idx = ingest.CorpusIndex(self.db)
        try:
            titles = [row[1] for row in idx.fts_search('c++ "coher')]
        finally:
            idx.close()
        self.assertIn("cc", titles)

    def test_tfidf_ranks_matching_document_first(self):
        self.ingest_corpus()
        idx = ingest.CorpusIndex(self.db)
        try:
            results = idx.tfidf_search("kernel")
        finally:
            idx.close()
        self.assertEqual(results[0][1], "ghost")

    def test_watch_is_rejected(self):
        result = run_cli("--watch", str(self.corpus), "--db", self.db)
        self.assertEqual(result.returncode, 2)


class TestVerify(IngestTestCase):
    def assert_verify_fails(self, expected_fragment):
        result = run_cli("--verify", "--db", self.db)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn(expected_fragment, result.stdout)

    def test_clean_archive_verifies(self):
        self.ingest_corpus()
        result = run_cli("--verify", "--db", self.db)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("VERIFY OK: 3 documents", result.stdout)

    def test_edited_content_is_detected(self):
        self.ingest_corpus()
        self.execute("UPDATE documents SET content_plain = 'tampered' WHERE title = 'ghost'")
        self.assert_verify_fails("content does not match its sha3_512")

    def test_rehashed_content_breaks_the_seal(self):
        self.ingest_corpus()
        idx = ingest.CorpusIndex(self.db)
        new_hash = idx.sha3("tampered")
        idx.close()
        self.execute("UPDATE documents SET content_plain = 'tampered', sha3_512 = ? WHERE title = 'ghost'", (new_hash,))
        self.assert_verify_fails("sealed document is missing")

    def test_edited_seal_breaks_the_chain(self):
        self.ingest_corpus()
        self.execute("UPDATE merkle_seals SET created_at = created_at + 1 WHERE version = 2")
        self.assert_verify_fails("chain broken here")

    def test_deleted_seal_is_detected(self):
        self.ingest_corpus()
        self.execute("DELETE FROM merkle_seals WHERE version = 2")
        self.assert_verify_fails("expected 2")

    def test_deleted_document_is_detected(self):
        self.ingest_corpus()
        self.execute("DELETE FROM documents WHERE title = 'cc'")
        self.assert_verify_fails("sealed document is missing")

    def test_legacy_database_gains_doc_sha3_column(self):
        conn = sqlite3.connect(self.db)
        conn.execute(
            "CREATE TABLE merkle_seals (id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL, "
            "seal_hash TEXT NOT NULL, created_at INTEGER NOT NULL, description TEXT)"
        )
        conn.commit()
        conn.close()
        ingest.CorpusIndex(self.db).close()
        columns = [row[1] for row in self.query("PRAGMA table_info(merkle_seals)")]
        self.assertIn("doc_sha3", columns)


if __name__ == "__main__":
    unittest.main()
