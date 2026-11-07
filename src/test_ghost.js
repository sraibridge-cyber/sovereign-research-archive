/**
 * test_ghost.js — Smoke tests for GHOST v9.1.0 kernel and face modules
 *
 * Run: node test_ghost.js
 */

'use strict';

var ghostKernel = require('./ghost_kernel.js');
var ghostFace = require('./ghost_face.js');

var passed = 0;
var failed = 0;

function assert(name, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log('  PASS: ' + name);
  } else {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('    Expected: ' + JSON.stringify(expected));
    console.log('    Actual:   ' + JSON.stringify(actual));
  }
}

function assertTruthy(name, value) {
  if (value) {
    passed++;
    console.log('  PASS: ' + name);
  } else {
    failed++;
    console.log('  FAIL: ' + name + ' (expected truthy, got ' + JSON.stringify(value) + ')');
  }
}

function assertGTE(name, actual, threshold) {
  if (actual >= threshold) {
    passed++;
    console.log('  PASS: ' + name + ' (' + actual + ' >= ' + threshold + ')');
  } else {
    failed++;
    console.log('  FAIL: ' + name + ' (' + actual + ' < ' + threshold + ')');
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  GHOST v9.1.0 — Smoke Tests');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Test 1: SHA3-512 hashing
console.log('Test Group: Hashing');
var hash = ghostKernel.sha3_512('test');
assertTruthy('SHA3-512 produces 128-char hex string', hash && hash.length === 128);

// Test 2: Merkle root
console.log('');
console.log('Test Group: Merkle Integrity');
var items = ['a', 'b', 'c', 'd'];
var root = ghostKernel.computeMerkleRoot(items);
assertTruthy('Merkle root is a 128-char hex string', root && root.length === 128);
var root2 = ghostKernel.computeMerkleRoot(items);
assert('Merkle root is deterministic', root, root2);

// Test 3: Coherence scoring
console.log('');
console.log('Test Group: Coherence Calculus');
var coherence = ghostKernel.computeCoherence({
  content: 'This is a test metabolic event with sufficient semantic density and character length to pass scoring thresholds across multiple coherence domains in the GHOST kernel architecture.',
  source: 'test',
  timestamp: Date.now(),
  topology: true,
  consensus: 1.0,
  constitutional: 1.0,
  noveltyScore: 1.0
});
assertTruthy('Coherence returns μ score', typeof coherence.mu === 'number');
assertTruthy('Coherence returns 8 domains', Object.keys(coherence.domains).length === 8);
assertTruthy('Coherence returns admitted flag', typeof coherence.admitted === 'boolean');

// Test 4: Tesseract vertex
console.log('');
console.log('Test Group: Tesseract B⁴ Memory');
var vertex = ghostKernel.tesseractVertex(coherence);
assertTruthy('Tesseract vertex is 0-15', vertex >= 0 && vertex <= 15);
var label = ghostKernel.vertexLabel(vertex);
assertTruthy('Vertex has label', typeof label === 'string');

// Test 5: Whitlock Coefficient
console.log('');
console.log('Test Group: Whitlock Coefficient');
var wc = ghostKernel.whitlockCoefficient(17, 1);
assertTruthy('W has real component', typeof wc.W.real === 'number');
assertTruthy('W has imag component', typeof wc.W.imag === 'number');
assertTruthy('W has magnitude', typeof wc.W.magnitude === 'number');
assertTruthy('Phase angle is numeric', typeof wc.phaseAngle === 'number');
assertTruthy('Phase label is a string', typeof wc.phaseLabel === 'string');
// W(n=0, i=1) should have phase angle 90 (Foundation)
var wc0 = ghostKernel.whitlockCoefficient(0, 1);
assertGTE('Foundation phase is near 90°', wc0.phaseAngle, 80);

// Test 6: Laws
console.log('');
console.log('Test Group: 17 Laws of Harmony/Dominion');
assert('17 laws defined', ghostKernel.LAWS_OF_HARMONY.length, 17);
var lawCheck = ghostKernel.checkLaws({ content: 'clean local content' });
assertTruthy('Clean content passes law check', lawCheck.compliant);
var lawViolation = ghostKernel.checkLaws({ content: 'https://cloud-api.com fetch data' });
assertTruthy('External URL triggers law violation', !lawViolation.compliant);

// Test 7: Kernel creation and dispatch
console.log('');
console.log('Test Group: Kernel Dispatch');
var kernel = ghostKernel.createKernel();
kernel.start();

// Ping
var pingResult = kernel.dispatch({ action: 'ping' });
assertTruthy('Ping returns pong', pingResult.ok && pingResult.result.pong);

// Status
var statusResult = kernel.dispatch({ action: 'status' });
assertTruthy('Status returns version', statusResult.ok && statusResult.result.version === '9.1.0');
assert('Status shows 8 domains', statusResult.result.domains.length, 8);
assert('Status shows 17 laws', statusResult.result.lawsCount, 17);

// Ingest
var ingestResult = kernel.dispatch({
  action: 'ingest',
  payload: {
    event: {
      content: 'This is a research metabolic event with sufficient semantic density and character length to pass coherence scoring thresholds across all eight domains in the GHOST kernel architecture for sovereign research archive on-device processing.',
      source: 'test_suite',
      timestamp: Date.now(),
      topology: true,
      consensus: 1.0,
      constitutional: 1.0,
      noveltyScore: 1.0
    }
  }
});
assertTruthy('Ingest returns coherence score', typeof ingestResult.result.coherence === 'number');
assertTruthy('Ingest returns vertex', typeof ingestResult.result.vertex === 'number');

// Query
var queryResult = kernel.dispatch({ action: 'query', payload: { limit: 5 } });
assertTruthy('Query returns results array', Array.isArray(queryResult.result.results));

// Verify
var verifyResult = kernel.dispatch({ action: 'verify' });
assertTruthy('Verify returns valid flag', typeof verifyResult.result.valid === 'boolean');

// Laws
var lawsResult = kernel.dispatch({ action: 'laws' });
assert('Laws endpoint returns 17 laws', lawsResult.result.laws.length, 17);

// Observe
var observeResult = kernel.dispatch({ action: 'observe' });
assertTruthy('Observe returns observations array', Array.isArray(observeResult.result.observations));

// Coefficient
var coeffResult = kernel.dispatch({ action: 'coefficient' });
assertTruthy('Coefficient returns W object', coeffResult.result.W);

kernel.stop();

// Test 8: Face creation
console.log('');
console.log('Test Group: Face Interface');
var kernel2 = ghostKernel.createKernel();
kernel2.start();
var face = ghostFace.createFace({ kernel: kernel2 });
face.start();

var faceStatus = face.sendToKernelSync({ action: 'ping' });
assertTruthy('Face proxies ping to kernel', faceStatus.ok && faceStatus.result.pong);

var faceStatusResult = face._handleMessage({ action: 'face_status' });
assertTruthy('Face returns own status', faceStatusResult.ok && faceStatusResult.result.version === '9.1.0');

var personasResult = face._handleMessage({ action: 'personas' });
assertTruthy('Face returns 5 personas', personasResult.result && Object.keys(personasResult.result.personas).length === 5);

face.stop();
kernel2.stop();

// Summary
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('  ALL TESTS PASSED');
} else {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
