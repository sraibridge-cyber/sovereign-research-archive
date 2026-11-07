/**
 * sraibridge.js — SR-AIbridge Protocol Layer
 *
 * Sovereign Research Archive — Complex System Sanity Labs
 *
 * The SR-AIbridge layer sits between the GHOST kernel (ghost_kernel.js) and
 * the Tesseract B⁴ memory topology (tesseract_memory.js) + the SQLite corpus
 * index (from the ingestion pipeline, step 2). It handles:
 *
 *   1. Query routing   — interpret a user/research query, decide which axes
 *                        and stores to consult, and fan out to them.
 *   2. Retrieval       — pull ranked records from the corpus FTS5 index and
 *                        the Tesseract topology, fuse the results.
 *   3. Response assembly — build a single coherent response object with
 *                        provenance, coherence scores, and vertex routing.
 *
 * All of this runs on-device. Zero cloud, zero vendor deps (Law 10, Law 11).
 * When better-sqlite3 is unavailable it degrades to the in-memory topology
 * store so the kernel still answers queries on a bundled JS engine.
 */

'use strict';

// ---------------------------------------------------------------------------
// Conditional requires
// ---------------------------------------------------------------------------
var HAS_SQLITE = false;
var Database = null;
try { Database = require('better-sqlite3'); HAS_SQLITE = true; } catch (e) {}

var fs = null;
var path = null;
try { fs = require('fs'); } catch (e) {}
try { path = require('path'); } catch (e) {}

var TesseractMemory = null;
try { TesseractMemory = require('./tesseract_memory.js'); } catch (e) {}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var SR_VERSION = '1.0.0';
var PROTOCOL = 'SR-AIbridge/1.0';

// Result-fusion weights (sum to 1.0)
var DEFAULT_WEIGHTS = {
  semantic: 0.45,   // FTS5 / token relevance
  temporal: 0.20,   // recency / authoredAt
  causal:   0.15,   // source provenance
  relational: 0.20  // graph proximity
};

// ---------------------------------------------------------------------------
// createBridge — construct an SR-AIbridge instance.
// options:
//   kernel       — a GHOST kernel instance (in-process) [required]
//   dbPath       — path to the SQLite corpus index (corpus.db) [optional]
//   topology     — an existing TesseractMemory instance [optional]
//   weights      — override fusion weights [optional]
// ---------------------------------------------------------------------------
function createBridge(options) {
  if (!options) options = {};
  if (!options.kernel) throw new Error('SR-AIbridge requires a kernel instance');

  var bridge = {
    version: SR_VERSION,
    protocol: PROTOCOL,
    kernel: options.kernel,
    dbPath: options.dbPath || (path ? path.join(process.cwd(), 'corpus.db') : 'corpus.db'),
    weights: options.weights || DEFAULT_WEIGHTS,
    _db: null,
    useSqlite: false,
    topology: options.topology || (TesseractMemory ? TesseractMemory.createTesseractMemory({ dbPath: options.dbPath }) : null)
  };

  // ------------------------------------------------------------------
  // Corpus index access (SQLite FTS5 from the ingestion pipeline).
  // The ingestion pipeline (step 2) is expected to create a `corpus` FTS5
  // table with columns: rowid, doc_id, title, source, content, authored_at.
  // We tolerate either that schema or a plain `documents` table.
  // ------------------------------------------------------------------
  bridge._openCorpus = function() {
    if (this._db) return this._db;
    if (!HAS_SQLITE) return null;
    try {
      this._db = new Database(this.dbPath, { readonly: true });
      this.useSqlite = true;
      return this._db;
    } catch (e) {
      this.useSqlite = false;
      this._db = null;
      return null;
    }
  };

  // ------------------------------------------------------------------
  // searchCorpus — FTS5 full-text query against the corpus index.
  // Returns [{ doc_id, title, source, snippet, rank, authored_at }].
  // ------------------------------------------------------------------
  bridge.searchCorpus = function(queryText, limit) {
    if (limit === undefined) limit = 20;
    var db = this._openCorpus();
    if (!db) return [];
    try {
      // FTS5 MATCH query; fall back to LIKE if FTS table absent.
      var fts = null;
      try {
        fts = db.prepare(
          'SELECT doc_id, title, source, snippet(corpus, 5, "<mark>", "</mark>", "…", 24) AS snippet, ' +
          'rank, authored_at FROM corpus WHERE corpus MATCH ? ORDER BY rank LIMIT ?'
        );
      } catch (e2) {
        fts = db.prepare(
          'SELECT doc_id, title, source, substr(content,1,240) AS snippet, ' +
          '1.0 AS rank, authored_at FROM documents WHERE content LIKE ? ORDER BY authored_at DESC LIMIT ?'
        );
      }
      var rows = fts.all(queryText, limit);
      return rows.map(function(r) {
        return {
          docId: r.doc_id, title: r.title, source: r.source,
          snippet: r.snippet, rank: r.rank, authoredAt: r.authored_at
        };
      });
    } catch (e) {
      return [];
    }
  };

  // ------------------------------------------------------------------
  // routeQuery — decide which axes/stores to consult for a query.
  // Returns a plan: { axes: [...], useFts: bool, useTopology: bool, vertexFilter }.
  // A query with a date range leans Temporal; a free-text query leans
  // Semantic; a source-id query leans Causal; a "related to X" leans
  // Relational. Every query consults FTS when available.
  // ------------------------------------------------------------------
  bridge.routeQuery = function(query) {
    if (!query) query = {};
    var q = query.text || query.q || '';
    var axes = [];
    var useFts = true;
    var useTopology = !!this.topology;

    if (query.from !== undefined || query.to !== undefined) axes.push('Temporal');
    if (q) axes.push('Semantic');
    if (query.source) axes.push('Causal');
    if (query.relatedTo) axes.push('Relational');

    // If no axis was implied, consult all four (general search).
    if (axes.length === 0) axes = ['Temporal', 'Semantic', 'Causal', 'Relational'];

    var vertexFilter = (query.vertex !== undefined) ? query.vertex : null;

    return {
      axes: axes,
      useFts: useFts,
      useTopology: useTopology,
      vertexFilter: vertexFilter,
      minCoherence: query.minCoherence || 0
    };
  };

  // ------------------------------------------------------------------
  // retrieve — execute a query plan across the corpus index + topology.
  // Returns fused, ranked results.
  // ------------------------------------------------------------------
  bridge.retrieve = function(query, plan) {
    if (!plan) plan = this.routeQuery(query);
    var q = query.text || query.q || '';
    var limit = query.limit || 20;
    var results = [];

    // --- FTS5 corpus retrieval (Semantic axis, primary) ---
    if (plan.useFts && q) {
      var corpusRows = this.searchCorpus(q, limit);
      corpusRows.forEach(function(r, idx) {
        results.push({
          recordId: 'corpus:' + r.docId,
          source: r.source,
          title: r.title,
          snippet: r.snippet,
          score: _ftsRankToScore(r.rank),
          axis: 'Semantic',
          origin: 'corpus',
          authoredAt: r.authoredAt,
          coherence: null,
          vertex: null
        });
      });
    }

    // --- Topology retrieval (axes + vertex + relational) ---
    if (plan.useTopology && this.topology) {
      var topo = this.topology;

      // Temporal range
      if (query.from !== undefined || query.to !== undefined) {
        var from = query.from || 0;
        var to = query.to || Date.now();
        topo.retrieveTemporalRange(from, to, limit).forEach(function(r) {
          results.push({
            recordId: r.id, source: r.source, title: null,
            snippet: (r.content || '').slice(0, 240),
            score: r.coherenceMu, axis: 'Temporal', origin: 'topology',
            authoredAt: r.authoredAt, coherence: r.coherenceMu, vertex: r.vertex
          });
        });
      }

      // Semantic (in-memory token match, supplements FTS)
      if (q && results.length < limit) {
        topo.retrieveSemantic(q, limit).forEach(function(r) {
          if (!_seenId(results, r.id)) {
            results.push({
              recordId: r.id, source: r.source, title: null,
              snippet: (r.content || '').slice(0, 240),
              score: r.coherenceMu, axis: 'Semantic', origin: 'topology',
              authoredAt: r.authoredAt, coherence: r.coherenceMu, vertex: r.vertex
            });
          }
        });
      }

      // Vertex filter (e.g. only admitted / PPPP records)
      if (plan.vertexFilter !== null) {
        var vResults = topo.retrieveByVertex(plan.vertexFilter, limit);
        vResults.forEach(function(r) {
          if (!_seenId(results, r.id)) {
            results.push({
              recordId: r.id, source: r.source, title: null,
              snippet: (r.content || '').slice(0, 240),
              score: r.coherenceMu, axis: 'Vertex', origin: 'topology',
              authoredAt: r.authoredAt, coherence: r.coherenceMu, vertex: r.vertex
            });
          }
        });
      }

      // Relational graph walk
      if (query.relatedTo) {
        topo.retrieveRelated(query.relatedTo, query.depth || 1, limit).forEach(function(r) {
          if (!_seenId(results, r.id)) {
            results.push({
              recordId: r.id, source: r.source, title: null,
              snippet: (r.content || '').slice(0, 240),
              score: r.coherenceMu, axis: 'Relational', origin: 'topology',
              authoredAt: r.authoredAt, coherence: r.coherenceMu, vertex: r.vertex
            });
          }
        });
      }

      // Causal (source filter)
      if (query.source) {
        topo.records.forEach(function(r) {
          if (r.source === query.source && !_seenId(results, r.id)) {
            results.push({
              recordId: r.id, source: r.source, title: null,
              snippet: (r.content || '').slice(0, 240),
              score: r.coherenceMu, axis: 'Causal', origin: 'topology',
              authoredAt: r.authoredAt, coherence: r.coherenceMu, vertex: r.vertex
            });
          }
        });
      }
    }

    // --- Coherence minimum filter ---
    if (plan.minCoherence > 0) {
      results = results.filter(function(r) {
        return (r.coherence === null) || (r.coherence >= plan.minCoherence);
      });
    }

    // --- Fuse + rank ---
    results = _fuse(results, this.weights);
    return results.slice(0, limit);
  };

  // ------------------------------------------------------------------
  // assembleResponse — build a single response object from fused results.
  // This is what the face (ghost_face.js) hands to the UI / caller.
  // ------------------------------------------------------------------
  bridge.assembleResponse = function(query, results) {
    var q = query.text || query.q || '';
    var plan = (typeof query === 'object' && query._plan) ? query._plan : this.routeQuery(query);

    // Top result is the highest-scoring fused item.
    var top = results.length ? results[0] : null;

    // Ask the kernel for the current Whitlock coefficient / phase, so the
    // response carries the kernel's maturity context (Law 6 phase decay).
    var coeff = null;
    try {
      var coeffResp = this.kernel.dispatch({ action: 'coefficient' });
      if (coeffResp && coeffResp.ok) coeff = coeffResp.result;
    } catch (e) { /* kernel in-process; ignore */ }

    return {
      protocol: this.protocol,
      version: this.version,
      query: q,
      plan: { axes: plan.axes, useFts: plan.useFts, useTopology: plan.useTopology, vertexFilter: plan.vertexFilter },
      totalResults: results.length,
      results: results,
      topResult: top,
      whitlockCoefficient: coeff,
      assembledAt: Date.now()
    };
  };

  // ------------------------------------------------------------------
  // search — the one-call entry point: route -> retrieve -> assemble.
  // Used by ghost_face.js and the in-process kernel query handler.
  // ------------------------------------------------------------------
  bridge.search = function(query) {
    if (!query) query = {};
    var plan = this.routeQuery(query);
    var results = this.retrieve(query, plan);
    return this.assembleResponse(query, results);
  };

  // ------------------------------------------------------------------
  // ingestAndIndex — wire a kernel ingestion result into the topology.
  // Called after the kernel's 'ingest' handler admits an event, so the B⁴
  // topology stays in sync with the kernel's LTM store.
  // ------------------------------------------------------------------
  bridge.ingestAndIndex = function(event, ingestResult) {
    if (!this.topology) return null;
    if (!ingestResult || !ingestResult.admitted) return null;

    var record = {
      id: null, // topology will derive a content key
      content: event.content || '',
      source: event.source || 'unknown',
      timestamp: event.timestamp || Date.now(),
      coherence: ingestResult,           // kernel coherence result (has .mu, .domains)
      vertex: ingestResult.vertex,
      vertexLabel: ingestResult.vertexLabel,
      corpusDocId: event.corpusDocId || null,
      authoredAt: event.authoredAt || event.timestamp || Date.now(),
      relations: event.relations || []
    };
    return this.topology.store(record);
  };

  // ------------------------------------------------------------------
  // status — report bridge + topology + corpus readiness.
  // ------------------------------------------------------------------
  bridge.status = function() {
    var topoStats = this.topology ? this.topology.stats() : null;
    return {
      protocol: this.protocol,
      version: this.version,
      useSqlite: this.useSqlite,
      dbPath: this.dbPath,
      topology: topoStats,
      kernelVersion: (this.kernel && this.kernel.version) || null,
      ready: true
    };
  };

  bridge.close = function() {
    if (this._db) { try { this._db.close(); } catch (e) {} this._db = null; }
    if (this.topology) this.topology.close();
  };

  // Eagerly probe the corpus so useSqlite is set before first search.
  bridge._openCorpus();

  return bridge;
}

// ---------------------------------------------------------------------------
// Fusion helpers
// ---------------------------------------------------------------------------
function _ftsRankToScore(rank) {
  // FTS5 rank is a relevance score (lower = better in some builds); normalize
  // to a 0..1 score where higher is better.
  if (typeof rank !== 'number') return 0.5;
  if (rank <= 0) return 1.0;
  return Math.min(1 / (1 + rank), 1.0);
}

function _seenId(results, id) {
  for (var i = 0; i < results.length; i++) {
    if (results[i].recordId === id) return true;
  }
  return false;
}

function _fuse(results, weights) {
  // Weight each result by its axis weight and sort descending.
  var w = weights || DEFAULT_WEIGHTS;
  return results.map(function(r) {
    var axisWeight = w[r.axis.toLowerCase()] || 0.25;
    r.fusedScore = r.score * axisWeight;
    return r;
  }).sort(function(a, b) { return b.fusedScore - a.fusedScore; });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
var SRAIBridge = {
  version: SR_VERSION,
  protocol: PROTOCOL,
  createBridge: createBridge,
  DEFAULT_WEIGHTS: DEFAULT_WEIGHTS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SRAIBridge;
}
