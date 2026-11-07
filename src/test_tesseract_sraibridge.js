/**
 * test_tesseract_sraibridge.js — Smoke tests for the Tesseract B⁴ memory
 * topology and the SR-AIbridge protocol layer.
 *
 * Run: node src/test_tesseract_sraibridge.js
 */

'use strict';

var TesseractMemory = require('./tesseract_memory.js');
var SRAIBridge = require('./sraibridge.js');

var passed = 0;
var failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  PASS: ' + name);
  } else {
    failed++;
    console.log('  FAIL: ' + name + (detail ? ' — ' + detail : ''));
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Tesseract B⁴ Memory + SR-AIbridge — Smoke Tests');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// ---- Tesseract Memory ----
console.log('Test Group: Tesseract B⁴ Memory');

var mem = TesseractMemory.createTesseractMemory({ dbPath: ':memory:' });
ok('createTesseractMemory returns object', typeof mem === 'object');
ok('has 4 axes', TesseractMemory.TESSERACT_AXES.length === 4);
ok('admit vertex is 15', TesseractMemory.TESSERACT_VERTEX_ADMIT === 15);
ok('vertexLabel(15) is PPPP_Admit', TesseractMemory.vertexLabel(15) === 'PPPP_Admit');

// computeVertex
var vHigh = mem.computeVertex({ temporal: 1, semantic: 1, causal: 1, relational: 1 });
ok('all-pass axes -> vertex 15', vHigh === 15, 'got ' + vHigh);
var vLow = mem.computeVertex({ temporal: 0, semantic: 0, causal: 0, relational: 0 });
ok('all-fail axes -> vertex 0', vLow === 0, 'got ' + vLow);

// deriveAxes from a kernel-style coherence result
var coherenceResult = {
  mu: 0.9996,
  domains: {
    D1_Signal: 0.9996, D2_Energy: 0.9996, D3_Temporal: 0.9996, D4_Spatial: 0.9996,
    D5_Cognitive: 0.9996, D6_Ethical: 0.9996, D7_Declarative: 0.9996, D8_Novelty: 0.9996
  },
  admitted: true
};
var axes = mem.deriveAxes(coherenceResult, { content: 'test' });
ok('deriveAxes returns 4 axes', Object.keys(axes).length === 4);
ok('all axes > 0.99', axes.temporal > 0.99 && axes.semantic > 0.99 && axes.causal > 0.99 && axes.relational > 0.99);

// store
var stored = mem.store({
  content: 'Coherence calculus governs metabolic events in the GHOST kernel architecture.',
  source: 'master-index',
  timestamp: Date.now(),
  coherence: coherenceResult,
  corpusDocId: 'doc-1',
  relations: ['doc-2']
});
ok('store returns a row with id', stored && typeof stored.id === 'string');
ok('stored vertex is 15 (PPPP)', stored.vertex === 15, 'got ' + stored.vertex);
ok('stored vertexLabel is PPPP_Admit', stored.vertexLabel === 'PPPP_Admit');
ok('stats reports 1 record', mem.stats().totalRecords === 1);
ok('stats reports 1 admitted', mem.stats().admitted === 1);

// retrieveAdmitted
var admitted = mem.retrieveAdmitted(10);
ok('retrieveAdmitted returns the stored record', admitted.length === 1 && admitted[0].id === stored.id);

// retrieveTemporalRange
var tResults = mem.retrieveTemporalRange(0, Date.now() + 1000, 10);
ok('retrieveTemporalRange finds the record', tResults.length === 1);

// retrieveSemantic
var sResults = mem.retrieveSemantic('coherence calculus kernel', 10);
ok('retrieveSemantic matches on tokens', sResults.length >= 1);

// retrieveRelated
var relResults = mem.retrieveRelated(stored.id, 1, 10);
ok('retrieveRelated returns edges (may be empty if target not stored)', Array.isArray(relResults));

// store a non-admitted record (low coherence)
var lowCoherence = {
  mu: 0.1,
  domains: {
    D1_Signal: 0.1, D2_Energy: 0.1, D3_Temporal: 0.1, D4_Spatial: 0.1,
    D5_Cognitive: 0.1, D6_Ethical: 0.1, D7_Declarative: 0.1, D8_Novelty: 0.1
  },
  admitted: false
};
var lowStored = mem.store({
  content: 'x',
  source: 'low',
  coherence: lowCoherence
});
ok('low-coherence record stored at vertex 0', lowStored.vertex === 0, 'got ' + lowStored.vertex);
ok('retrieveByVertex(0) finds it', mem.retrieveByVertex(0, 10).length >= 1);

// ---- SR-AIbridge ----
console.log('');
console.log('Test Group: SR-AIbridge Protocol Layer');

// Minimal fake kernel so the bridge can run without the full kernel.
var fakeKernel = {
  version: '9.1.0',
  dispatch: function(msg) {
    if (msg.action === 'coefficient') {
      return { ok: true, result: { W: { real: 1, imag: 0.2, magnitude: 1.02 }, phaseAngle: 45, phaseLabel: 'Resonance' } };
    }
    return { ok: true, result: {} };
  }
};

var bridge = SRAIBridge.createBridge({ kernel: fakeKernel, dbPath: ':memory:' });
ok('createBridge returns object', typeof bridge === 'object');
ok('bridge has protocol string', typeof bridge.protocol === 'string');
ok('bridge status ready', bridge.status().ready === true);

// routeQuery
var planText = bridge.routeQuery({ text: 'coherence calculus' });
ok('routeQuery includes Semantic axis for text', planText.axes.indexOf('Semantic') >= 0);
ok('routeQuery uses FTS', planText.useFts === true);
ok('routeQuery uses topology', planRouteTopo(planText));

var planDate = bridge.routeQuery({ from: 0, to: Date.now() });
ok('routeQuery includes Temporal for date range', planDate.axes.indexOf('Temporal') >= 0);

var planSource = bridge.routeQuery({ source: 'master-index' });
ok('routeQuery includes Causal for source', planSource.axes.indexOf('Causal') >= 0);

var planRel = bridge.routeQuery({ relatedTo: 'doc-1' });
ok('routeQuery includes Relational for relatedTo', planRel.axes.indexOf('Relational') >= 0);

// search (end-to-end) — uses topology since no SQLite FTS corpus exists in test
var response = bridge.search({ text: 'coherence', limit: 5 });
ok('search returns a response object', typeof response === 'object');
ok('response has protocol', response.protocol === SRAIBridge.protocol);
ok('response has results array', Array.isArray(response.results));
ok('response carries whitlockCoefficient', response.whitlockCoefficient !== null && typeof response.whitlockCoefficient === 'object');
ok('response totalResults is a number', typeof response.totalResults === 'number');

// ingestAndIndex wiring
var ingested = bridge.ingestAndIndex(
  { content: 'new metabolic event for ingestion', source: 'test', timestamp: Date.now() },
  { admitted: true, mu: 0.9996, vertex: 15, vertexLabel: 'PPPP_Admit', domains: coherenceResult.domains }
);
ok('ingestAndIndex stores admitted event in topology', ingested !== null && typeof ingested.id === 'string');
ok('ingested record vertex 15', ingested.vertex === 15);

// close
bridge.close();
mem.close();

console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
console.log('───────────────────────────────────────────────────────────');
if (failed > 0) process.exit(1);

function planRouteTopo(p) { return p.useTopology === true; }
