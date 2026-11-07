/**
 * tesseract_memory.js — Tesseract B⁴ Memory Topology
 *
 * Sovereign Research Archive — Complex System Sanity Labs
 *
 * A 4-dimensional memory structure organizing ingested research along four
 * orthogonal axes. The Tesseract B⁴ topology extends the GHOST kernel's
 * 16-vertex Boolean hypercube (tesseractVertex) with a corpus-backed
 * persistence and retrieval layer.
 *
 * Four axes:
 *   T  (Temporal)    — when the research was authored / observed
 *   S  (Semantic)    — what the research is about (term-vector / FTS match)
 *   C  (Causal)      — why it was produced (source chain, provenance links)
 *   R  (Relational)  — how it connects to other documents (graph edges)
 *
 * A memory vertex is the 4-bit Boolean signature of which axes a record
 * satisfies above the coherence threshold — the same vertex encoding the
 * kernel's tesseractVertex() function already produces (0..15), where vertex 15
 * (0b1111, "PPPP_Admit") is the sole admission vertex. This module stores the
 * per-axis evidence so the SR-AIbridge layer can rank and retrieve.
 *
 * Persistence: this module writes to a SQLite corpus index (the database
 * produced by the ingestion pipeline in step 2). When better-sqlite3 / a
 * SQLite binding is available it uses it; otherwise it falls back to an
 * in-memory store so the kernel still runs on a bundled JS engine with zero
 * native dependencies. Either path is vendorless and cloudless.
 *
 * Law 5 (Tesseract Topology): memory maps to a B⁴ hypercube; PPPP is the
 * sole admission vertex. Law 10 (Zero Vendor): no cloud, no external APIs.
 */

'use strict';

// ---------------------------------------------------------------------------
// Conditional requires — all optional, zero hard vendor deps
// ---------------------------------------------------------------------------
var HAS_SQLITE = false;
var Database = null;
try {
  Database = require('better-sqlite3');
  HAS_SQLITE = true;
} catch (e) { /* bundled engine without native sqlite */ }

var fs = null;
var path = null;
try { fs = require('fs'); } catch (e) {}
try { path = require('path'); } catch (e) {}

// ---------------------------------------------------------------------------
// Constants — mirror ghost_kernel.js so this module is self-describing
// ---------------------------------------------------------------------------
var TESSERACT_AXES = ['Temporal', 'Semantic', 'Causal', 'Relational'];
var TESSERACT_DIMENSIONS = 4;
var TESSERACT_VERTEX_ADMIT = 15; // 0b1111 — PPPP_Admit
var TESSERACT_VERTEX_COUNT = 16;

// Default coherence threshold for axis pass/fail (mirrors kernel μ ≥ 0.9995;
// axes are normalized 0..1 so we use the same ceiling-scaled threshold).
var DEFAULT_AXIS_THRESHOLD = 0.9995;

// ---------------------------------------------------------------------------
// Axis labels for every vertex 0..15 (mirror of kernel vertexLabel ordering)
// ---------------------------------------------------------------------------
var VERTEX_LABELS = [
  'PPPP_Fail', 'PPPS_Fail', 'PPSP_Fail', 'PPSS_Fail',
  'PSPP_Fail', 'PSPS_Fail', 'PSSP_Fail', 'PSSS_Fail',
  'SPPP_Fail', 'SPPS_Fail', 'SPSP_Fail', 'SPSS_Fail',
  'SSPP_Fail', 'SSPS_Fail', 'SSSP_Fail', 'PPPP_Admit'
];

function vertexLabel(vertex) {
  return VERTEX_LABELS[vertex] || 'Unknown';
}

// ---------------------------------------------------------------------------
// Lightweight hashing (FNV-1a 64-bit style, deterministic, no deps).
// The kernel's SHA3-512 is used for sealed integrity; this is only for
// content-addressed de-dup keys inside the topology, so a fast non-crypto
// hash is appropriate and keeps the module standalone.
// ---------------------------------------------------------------------------
function _fnv1a(str) {
  var h = 0xcbf29ce484222325;
  var s = String(str);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x100000001b3);
  }
  // force unsigned 32-bit range for portability across JS engines
  return (h >>> 0).toString(16);
}

function contentKey(content) {
  return _fnv1a(String(content || ''));
}

// ---------------------------------------------------------------------------
// TesseractMemory — the B⁴ topology store
// ---------------------------------------------------------------------------
function createTesseractMemory(options) {
  if (!options) options = {};

  var mem = {
    // SQLite corpus index path (from the ingestion pipeline)
    dbPath: options.dbPath || (path ? path.join(process.cwd(), 'corpus.db') : 'corpus.db'),
    // In-memory fallback store (always present; used when no SQLite binding)
    records: [],
    // Per-axis indexes for fast axis-scoped retrieval
    axisIndex: { Temporal: {}, Semantic: {}, Causal: {}, Relational: {} },
    // Adjacency (relational edges): recordId -> [connected recordId]
    edges: {},
    // SQLite handle (null when running in-memory)
    _db: null,
    useSqlite: false,
    axisThreshold: options.axisThreshold || DEFAULT_AXIS_THRESHOLD
  };

  // ------------------------------------------------------------------
  // Schema (applied to SQLite corpus DB; appends to the ingestion schema)
  // The ingestion pipeline (step 2) creates the corpus FTS5 tables. This
  // module adds the B⁴ topology tables that reference corpus rows.
  // ------------------------------------------------------------------
  var SCHEMA_SQL = [
    'CREATE TABLE IF NOT EXISTS tesseract_vertices (',
    '  record_id    TEXT PRIMARY KEY,',
    '  corpus_doc_id TEXT,',                       // FK -> corpus docs
    '  content_hash  TEXT,',
    '  vertex        INTEGER NOT NULL,',           // 0..15
    '  vertex_label  TEXT NOT NULL,',
    '  coherence_mu  REAL NOT NULL,',
    '  axis_temporal REAL,',                       // T axis score
    '  axis_semantic REAL,',                       // S axis score
    '  axis_causal   REAL,',                       // C axis score
    '  axis_relational REAL,',                     // R axis score
    '  source        TEXT,',
    '  authored_at   INTEGER,',                    // epoch ms (T axis anchor)
    '  ingested_at   INTEGER NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_tv_vertex ON tesseract_vertices(vertex);',
    'CREATE INDEX IF NOT EXISTS idx_tv_mu ON tesseract_vertices(coherence_mu);',
    'CREATE INDEX IF NOT EXISTS idx_tv_authored ON tesseract_vertices(authored_at);',
    'CREATE INDEX IF NOT EXISTS idx_tv_source ON tesseract_vertices(source);',
    'CREATE TABLE IF NOT EXISTS tesseract_edges (',
    '  from_id TEXT NOT NULL,',
    '  to_id   TEXT NOT NULL,',
    '  weight  REAL DEFAULT 1.0,',
    '  kind    TEXT DEFAULT "references",',        // references | cites | extends | related
    '  PRIMARY KEY (from_id, to_id, kind)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_te_from ON tesseract_edges(from_id);',
    'CREATE INDEX IF NOT EXISTS idx_te_to ON tesseract_edges(to_id);'
  ].join('\n');

  mem._openDb = function() {
    if (this._db) return this._db;
    if (!HAS_SQLITE) return null;
    try {
      this._db = new Database(this.dbPath);
      this._db.exec(SCHEMA_SQL);
      this.useSqlite = true;
      return this._db;
    } catch (e) {
      // Could not open the corpus DB — fall back to in-memory silently.
      // Law 2 (Sovereign Minimalism): degrade gracefully, never crash.
      this.useSqlite = false;
      this._db = null;
      return null;
    }
  };

  // ------------------------------------------------------------------
  // computeVertex — derive the 4-bit vertex from per-axis scores.
  // bit 3 (MSB) = Temporal, bit 2 = Semantic, bit 1 = Causal, bit 0 = Relational
  // This mirrors ghost_kernel tesseractVertex()'s grouping (two coherence
  // domains per axis) so the vertex the kernel computes and the vertex the
  // topology stores agree.
  // ------------------------------------------------------------------
  mem.computeVertex = function(axes) {
    if (!axes) axes = {};
    var t = (axes.temporal >= this.axisThreshold) ? 1 : 0;
    var s = (axes.semantic >= this.axisThreshold) ? 1 : 0;
    var c = (axes.causal >= this.axisThreshold) ? 1 : 0;
    var r = (axes.relational >= this.axisThreshold) ? 1 : 0;
    return (t << 3) | (s << 2) | (c << 1) | r;
  };

  // ------------------------------------------------------------------
  // deriveAxes — compute the four axis scores from a coherence result + event
  // The kernel already computes 8 coherence domains (D1..D8). We pair them:
  //   Temporal    <- D3_Temporal + D4_Spatial   (when + where)
  //   Semantic   <- D1_Signal + D8_Novelty     (signal density + novelty)
  //   Causal     <- D5_Cognitive + D7_Declarative (logic + integrity/provenance)
  //   Relational <- D2_Energy + D6_Ethical     (resource + governance fit)
  // Each axis is the geometric mean of its pair, normalized 0..1.
  // ------------------------------------------------------------------
  mem.deriveAxes = function(coherenceResult, event) {
    var d = (coherenceResult && coherenceResult.domains) || {};
    var ev = event || {};

    // Pull raw domain values. The kernel scales them by DOMAIN_CEILING; we
    // normalize back to 0..1 by dividing by the ceiling (read from the kernel
    // if available, else assume 1.0 — the threshold is the same ratio).
    var ceiling = (typeof DOMAIN_CEILING !== 'undefined') ? DOMAIN_CEILING : 1.0;
    var norm = function(v) { return ceiling > 0 ? (v || 0) / ceiling : (v || 0); };

    var t = _geomMean(norm(d.D3_Temporal), norm(d.D4_Spatial));
    var s = _geomMean(norm(d.D1_Signal), norm(d.D8_Novelty));
    var c = _geomMean(norm(d.D5_Cognitive), norm(d.D7_Declarative));
    var r = _geomMean(norm(d.D2_Energy), norm(d.D6_Ethical));

    return {
      temporal: t,
      semantic: s,
      causal: c,
      relational: r
    };
  };

  // ------------------------------------------------------------------
  // store — persist a memory record into the B⁴ topology.
  // `record` fields:
  //   id, content, source, timestamp, coherence (the kernel result),
  //   vertex, vertexLabel, corpusDocId (optional link to a corpus FTS5 row),
  //   authoredAt (optional, defaults to timestamp), relations (optional array)
  // ------------------------------------------------------------------
  mem.store = function(record) {
    if (!record) return null;
    var id = record.id || contentKey(record.content || (record.source || '') + ':' + (record.timestamp || Date.now()));
    var coherenceResult = record.coherence || {};
    var axes = this.deriveAxes(coherenceResult, record);
    var vertex = (record.vertex !== undefined) ? record.vertex : this.computeVertex(axes);
    var label = record.vertexLabel || vertexLabel(vertex);
    var mu = (coherenceResult.mu !== undefined) ? coherenceResult.mu : 0;
    var authoredAt = record.authoredAt || record.timestamp || Date.now();

    var row = {
      id: id,
      corpusDocId: record.corpusDocId || null,
      contentHash: contentKey(record.content),
      vertex: vertex,
      vertexLabel: label,
      coherenceMu: mu,
      axisTemporal: axes.temporal,
      axisSemantic: axes.semantic,
      axisCausal: axes.causal,
      axisRelational: axes.relational,
      source: record.source || 'unknown',
      authoredAt: authoredAt,
      ingestedAt: record.ingestedAt || Date.now(),
      content: record.content || ''
    };

    // In-memory store (always, for fallback + fast lookup)
    this.records.push(row);
    _indexAxis(this.axisIndex.Temporal, authoredAt, id);
    _indexAxis(this.axisIndex.Semantic, _tokenBucket(record.content), id);
    _indexAxis(this.axisIndex.Causal, record.source, id);
    _indexAxis(this.axisIndex.Relational, vertex, id);

    // Relational edges
    if (record.relations && record.relations.length) {
      this.edges[id] = (this.edges[id] || []).concat(record.relations);
    }

    // SQLite persistence (best-effort)
    var db = this._openDb();
    if (db) {
      try {
        db.prepare(
          'INSERT OR REPLACE INTO tesseract_vertices ' +
          '(record_id, corpus_doc_id, content_hash, vertex, vertex_label, coherence_mu, ' +
          ' axis_temporal, axis_semantic, axis_causal, axis_relational, source, authored_at, ingested_at) ' +
          'VALUES (@id, @corpusDocId, @contentHash, @vertex, @label, @mu, ' +
          ' @axisTemporal, @axisSemantic, @axisCausal, @axisRelational, @source, @authoredAt, @ingestedAt)'
        ).run({
          id: row.id, corpusDocId: row.corpusDocId, contentHash: row.contentHash,
          vertex: row.vertex, label: row.vertexLabel, mu: row.coherenceMu,
          axisTemporal: row.axisTemporal, axisSemantic: row.axisSemantic,
          axisCausal: row.axisCausal, axisRelational: row.axisRelational,
          source: row.source, authoredAt: row.authoredAt, ingestedAt: row.ingestedAt
        });
        if (record.relations && record.relations.length) {
          var edgeStmt = db.prepare(
            'INSERT OR REPLACE INTO tesseract_edges (from_id, to_id, kind) VALUES (?, ?, ?)'
          );
          record.relations.forEach(function(toId) {
            edgeStmt.run(row.id, toId, 'references');
          });
        }
      } catch (e) {
        // best-effort: in-memory copy is already stored
      }
    }
    return row;
  };

  // ------------------------------------------------------------------
  // retrieveByAxis — fetch records that pass a given axis above threshold.
  // axisName: 'Temporal' | 'Semantic' | 'Causal' | 'Relational'
  // ------------------------------------------------------------------
  mem.retrieveByAxis = function(axisName, threshold, limit) {
    if (limit === undefined) limit = 50;
    var th = (threshold !== undefined) ? threshold : this.axisThreshold;
    var axisKey = _axisScoreKey(axisName);
    var results = this.records.filter(function(r) {
      return r[axisKey] >= th;
    });
    return results.slice(0, limit);
  };

  // ------------------------------------------------------------------
  // retrieveByVertex — fetch records at a given B⁴ vertex (0..15).
  // ------------------------------------------------------------------
  mem.retrieveByVertex = function(vertex, limit) {
    if (limit === undefined) limit = 50;
    var results = this.records.filter(function(r) { return r.vertex === vertex; });
    return results.slice(0, limit);
  };

  // ------------------------------------------------------------------
  // retrieveAdmitted — vertex 15 only (the PPPP admission set).
  // ------------------------------------------------------------------
  mem.retrieveAdmitted = function(limit) {
    return this.retrieveByVertex(TESSERACT_VERTEX_ADMIT, limit);
  };

  // ------------------------------------------------------------------
  // retrieveTemporalRange — records authored within [from, to] epoch ms.
  // ------------------------------------------------------------------
  mem.retrieveTemporalRange = function(from, to, limit) {
    if (limit === undefined) limit = 50;
    var results = this.records.filter(function(r) {
      return r.authoredAt >= from && r.authoredAt <= to;
    });
    results.sort(function(a, b) { return a.authoredAt - b.authoredAt; });
    return results.slice(0, limit);
  };

  // ------------------------------------------------------------------
  // retrieveSemantic — term-vector match against the Semantic axis.
  // Naive token overlap (works without SQLite FTS5; when FTS5 is available
  // the SR-AIbridge layer will route to it for ranked results).
  // ------------------------------------------------------------------
  mem.retrieveSemantic = function(query, limit) {
    if (limit === undefined) limit = 50;
    var qTokens = _tokenSet(query);
    if (qTokens.length === 0) return [];
    var scored = this.records.map(function(r) {
      var rTokens = _tokenSet(r.content);
      var overlap = 0;
      for (var i = 0; i < qTokens.length; i++) {
        if (rTokens.indexOf(qTokens[i]) >= 0) overlap++;
      }
      return { record: r, score: overlap / qTokens.length };
    }).filter(function(x) { return x.score > 0; });
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function(x) { return x.record; });
  };

  // ------------------------------------------------------------------
  // retrieveRelated — graph neighbours of a record id (Relational axis).
  // ------------------------------------------------------------------
  mem.retrieveRelated = function(recordId, depth, limit) {
    if (depth === undefined) depth = 1;
    if (limit === undefined) limit = 50;
    var seen = {};
    var frontier = [recordId];
    var result = [];
    for (var d = 0; d < depth && frontier.length; d++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var id = frontier[i];
        if (seen[id]) continue;
        seen[id] = true;
        var neighbours = this.edges[id] || [];
        for (var j = 0; j < neighbours.length; j++) {
          if (!seen[neighbours[j]]) {
            next.push(neighbours[j]);
            var rec = this._findById(neighbours[j]);
            if (rec) result.push(rec);
          }
        }
      }
      frontier = next;
      if (result.length >= limit) break;
    }
    return result.slice(0, limit);
  };

  mem._findById = function(id) {
    for (var i = 0; i < this.records.length; i++) {
      if (this.records[i].id === id) return this.records[i];
    }
    return null;
  };

  // ------------------------------------------------------------------
  // stats — topology summary for the face dashboard.
  // ------------------------------------------------------------------
  mem.stats = function() {
    var byVertex = {};
    for (var i = 0; i < TESSERACT_VERTEX_COUNT; i++) byVertex[i] = 0;
    this.records.forEach(function(r) { byVertex[r.vertex] = (byVertex[r.vertex] || 0) + 1; });
    return {
      totalRecords: this.records.length,
      admitted: byVertex[TESSERACT_VERTEX_ADMIT] || 0,
      byVertex: byVertex,
      useSqlite: this.useSqlite,
      dbPath: this.dbPath,
      edges: Object.keys(this.edges).length
    };
  };

  mem.close = function() {
    if (this._db) { try { this._db.close(); } catch (e) {} this._db = null; }
  };

  // Eagerly open the DB so the schema is in place before first store().
  mem._openDb();

  return mem;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _geomMean(a, b) {
  a = a || 0; b = b || 0;
  if (a <= 0 || b <= 0) return 0;
  return Math.sqrt(a * b);
}

function _tokenSet(str) {
  var s = String(str || '').toLowerCase();
  var out = [];
  var seen = {};
  var parts = s.split(/[^a-z0-9]+/);
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i];
    if (t.length < 2 || seen[t]) continue;
    seen[t] = true;
    out.push(t);
  }
  return out;
}

function _tokenBucket(str) {
  var toks = _tokenSet(str);
  return toks.length ? toks[0] : ''; // bucket key for the Semantic axis index
}

function _indexAxis(index, key, id) {
  if (key === null || key === undefined || key === '') key = '_';
  key = String(key);
  if (!index[key]) index[key] = [];
  index[key].push(id);
}

function _axisScoreKey(axisName) {
  switch (axisName) {
    case 'Temporal': return 'axisTemporal';
    case 'Semantic': return 'axisSemantic';
    case 'Causal': return 'axisCausal';
    case 'Relational': return 'axisRelational';
    default: return 'axisTemporal';
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
var TesseractMemory = {
  version: '1.0.0',
  createTesseractMemory: createTesseractMemory,
  TESSERACT_AXES: TESSERACT_AXES,
  TESSERACT_VERTEX_ADMIT: TESSERACT_VERTEX_ADMIT,
  VERTEX_LABELS: VERTEX_LABELS,
  vertexLabel: vertexLabel,
  contentKey: contentKey
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TesseractMemory;
}
