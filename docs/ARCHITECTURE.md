# Sovereign Research Archive — Architecture Specification

**Version:** 1.1 (2026-11-18: sections 3–7, 10 and 12 updated to match the code; see docs/AUDIT-2026-11-18.md)  
**Kernel:** GHOST v9.1.0  
**Repository:** sraibridge-cyber/sovereign-research-archive  
**Organisation:** Complex System Sanity Labs  
**Architect:** Kyle Whitlock  

---

## 1. Purpose

The Sovereign Research Archive is a local-first, vendorless, cloudless system that ingests a full research corpus (~2,000 files from Google Drive) into a sealed SQLite database with FTS5 full-text search and TF-IDF vector similarity, then ships a zero-network Android APK that runs the GHOST kernel against that corpus entirely on-device.

No server farms. No cloud calls. No internet permissions. Every source, every version, every connection preserved and traceable through SHA3-512 Merkle seals.

## 2. Design principles

- **Local-first.** All computation, search, and reasoning happens on the device. The corpus is pre-indexed and shipped read-only.
- **Vendorless.** No external API calls, no cloud services, no vendor dependencies at runtime. SQLite is embedded; the kernel is self-contained.
- **Permanence.** Every version, every source, every connection preserved and traceable. SHA3-512 Merkle seals bind provenance to content. The seal chain links each build to its predecessor.
- **Zero-network.** The Android manifest declares no INTERNET permission. The kernel runs in dispatch mode (no port binding). The build verifies integrity before packaging. Three independent enforcement points.
- **No shortcuts.** No placeholder data, no duct tape. Every piece verified. A file that fails extraction is recorded with the failure reason, not omitted.

## 3. System overview

```
┌─────────────────────────────────────────────────────────┐
│                    HOST (ingestion)                       │
│  Drive export (local folder) -> tools/ingest.py -> archive.db │
│                     (Python, stdlib sqlite3)  (SQLite FTS5    │
│                                                + TF-IDF       │
│                                                + seal chain)  │
│  build_apk.sh -> kernel tests -> ingest.py --verify -> package│
└─────────────────────────────────────────┬─────────────────┘
                                          │
┌─────────────────────────────────────────▼─────────────────┐
│                  DEVICE (Android APK)                      │
│  app/ - Room (FTS5), Compose UI, ghost_kernel.js dispatch   │
│  ZERO NETWORK PERMISSIONS - enforced 3x                    │
│  1. Manifest  2. Kernel dispatch mode  3. Build verify     │
└───────────────────────────────────────────────────────────┘
```

## 4. Ingestion pipeline

### 4.1 Stage 1 - Corpus export (manual, host-side)
Export the Drive corpus to a local folder. Drive enumeration and provenance capture (file id, MIME, modified time, account) are not implemented yet; see Section 12.

### 4.2 Stage 2 - Extraction and indexing (tools/ingest.py)
`python3 tools/ingest.py --dir <export> --db archive.db`. Text, Markdown, HTML, JSON, XML, YAML and CSV are read directly; PDF needs PyMuPDF or pdfplumber; DOCX needs python-docx; legacy .doc is rejected. Each document is written in one transaction: the row, its FTS5 entry, term frequencies, corpus stats and its seal. A file that fails extraction is recorded in `ingest_failures` with the reason, not omitted. Identical content is deduplicated by SHA3-512.

`src/research_index.js` writes the same schema and seals from Node (library only, no file-ingest CLI).

### 4.3 Stage 3 - Verify and package (build_apk.sh)
Kernel tests (`test_ghost.js`, `test_sha3_fallback.js`), then `python3 tools/ingest.py --verify --db archive.db`, which recomputes every content hash and seal and aborts the build on any mismatch. The kernel and archive.db are copied into the app assets and the APK is built; the zero-network check reads the APK's permissions with `aapt`.

## 5. Database schema (as implemented)

The schema is created by `tools/ingest.py` and `src/research_index.js`, and mirrored by the Room entities in `app/src/main/java/com/sraibridge/sovereign/data/entity`. Room validates the bundled archive.db against those entities when it opens it, so all three must change together.

| table | purpose |
| --- | --- |
| documents | id, title, source_path, content_text, content_plain, sha3_512 (unique), file_type, ingested_at (ms), word_count |
| documents_fts | FTS5, external content over documents (title, content_plain, content_text), tokenizer porter unicode61 |
| term_frequencies | (doc_id, term) -> freq; terms are `[a-z0-9-]{3,}` after lowercasing |
| corpus_stats | single row id=1: total_docs, total_terms, last_updated |
| merkle_seals | one seal per document: version, seal_hash, created_at, description, doc_sha3 |
| ingest_failures | source_path, reason, recorded_at (not read by the app) |

### 5.1 Query paths
- Keyword: FTS5 MATCH with quoted prefix tokens, ordered by `rank` (BM25). On the device, a LIKE search is used if FTS5 is unavailable.
- Semantic: TF-IDF, score = sum over query terms of (freq / max freq in doc) x log10(total docs / doc frequency). The app computes it in Kotlin because Android SQLite has no LOG().

### 5.2 Original design, not implemented
The 1.0 spec described a `sources` provenance table (drive_file_id, original_name, mime_type, modified_time, extracted_account, extraction_status) and doc_stats/terms/postings/corpus_meta TF-IDF tables. No ingester produced them, and the app no longer reads them. Provenance beyond `source_path` is an open item (Section 12).

## 6. GHOST kernel integration

### 6.1 The kernel
ghost_kernel.js (32KB): Coherence Calculus v3.0, Tesseract B4 memory, Whitlock Coefficient, 17 Laws, SHA3-512 Merkle seals.

### 6.2 Zero-net execution
Port binding conditional on net module. Under bundled engine without net, kernel runs via call/dispatch. No sockets. No HTTP.

### 6.3 Kernel-to-index interface
Read-only handle to archive.db. Queries through thin adapter. Kernel never opens network socket.

### 6.4 Integrity verification
`npm test` runs the kernel tests (including `test_sha3_fallback.js`, which checks the kernel's pure-JS SHA3-512 against Node's crypto) and the ingest tests. `npm run verify` checks archive.db. build_apk.sh runs both before packaging; a failure aborts the build.

### 6.5 On-device engine
The app loads `ghost_kernel.js` from its assets with Rhino (`GhostKernelAdapter`), creates an in-memory kernel and calls `kernel.dispatch({action, payload})`. Rhino has no crypto module, so the kernel uses its own SHA3-512 there. The adapter is not yet called from the UI (the GHOST search mode uses FTS5 results).

## 7. Seal model (as implemented)

### 7.1 Seal primitive
SHA3-512.

### 7.2 Per-document seal chain
Each ingested document gets one seal:

`seal_hash = SHA3-512("SRA-SEAL-1|" version "|" previous seal_hash or GENESIS "|" doc_sha3 "|" created_at)`

where doc_sha3 is the document's `sha3_512` (SHA3-512 of content_plain) and created_at is the stored timestamp. The latest seal_hash is the root seal: it commits to every document's content and to the order they were added.

### 7.3 Verification
`tools/ingest.py --verify` recomputes every content hash, recomputes the chain from GENESIS, checks that every document has a seal and every seal's document exists, runs the FTS5 integrity check and checks corpus_stats. It prints the root seal.

### 7.4 Trust anchor
A hash chain detects changes only when compared with a root seal kept somewhere else. Record each build's root seal outside archive.db (release notes, Drive) and compare it when verifying. Not automated yet.

### 7.5 Not yet implemented from 1.0
Merkle tree over per-source seals, build manifest with prior root seal, and runtime verification on the device at load time.

## 8. Android packaging

### 8.1 What ships
1. Sealed archive.db (read-only). 2. GHOST kernel bundle. 3. Minimal Android shell.

### 8.2 Stack
Jetpack Compose, Room over SQLite (archive.db opened with createFromAsset), Rhino for the GHOST kernel, build_apk.sh with verification.

### 8.3 What does not ship
No Drive credentials. No network. No telemetry.

## 9. Zero-network boundary
1. Manifest: no INTERNET permission. 2. Kernel: dispatch mode. 3. Build: verify integrity.

## 10. Repository structure
```
sovereign-research-archive/
├── src/ (ghost_kernel.js, ghost_face.js, start_ghost.js, test_ghost.js, test_sha3_fallback.js,
│         research_index.js, drive_scanner.js, ingest_pipeline.js)
├── tools/ (ingest.py, test_ingest.py, requirements.txt)
├── app/ (Android APK: Compose, Room, zero-net manifest)
├── app-crawler/ (Drive ingestion companion; network app, separate APK)
├── docs/ARCHITECTURE.md
├── build_apk.sh, build.gradle.kts, settings.gradle.kts, package.json
```

## 11. Contract summary
- Ingestion: archive.db with schema Section 5, seals Section 7. FTS5 BM25 + TF-IDF ranking.
- Kernel: in-process dispatch, state.json sealed, verify passes.
- APK: Compose + Room, zero-net manifest, build verifies seals.
- Seals: SHA3-512 per-document chain; root seal printed by --verify (anchoring it is open, Section 12).

## 12. Open items
- Provenance capture (Drive file id, MIME, modified time, account) in archive.db.
- Root-seal trust anchor outside archive.db, and runtime verification on the device.
- Wire GhostKernelAdapter into the GHOST search mode.
- app-crawler: no OAuth flow (the token is a literal placeholder), and it writes its own crawl_cache.db schema that nothing exports to archive.db.
- OCR for scanned PDFs (recorded as failures for now).
- Exact corpus folder list on Drive (resolved at ingestion time).
