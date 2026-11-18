// test_sha3_fallback.js — checks the kernel's pure-JS SHA3-512 against Node's crypto.
//
// On Android (Rhino) the kernel has no crypto module and hashes with its own Keccak
// implementation. If that implementation drifts from FIPS 202, seals and Merkle roots made
// on the device stop matching the ones made on the host. This test loads the kernel in a
// sandbox where require() fails, so the fallback path is the one exercised.

'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var source = fs.readFileSync(path.join(__dirname, 'ghost_kernel.js'), 'utf8');
var sandbox = {
  module: { exports: {} },
  console: console,
  Date: Date,
  require: function (name) { throw new Error('module unavailable: ' + name); }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
var kernel = sandbox.module.exports;

// Deterministic pseudo-random strings (LCG) so failures are reproducible.
var seed = 20261118;
function nextInt(max) {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % max;
}

var cases = ['', 'abc', 'Coherence Calculus', '\u00e9', '\u65e5\u672c\u8a9e',
  '\ud83d\ude00 emoji', 'lone \ud800 high', 'lone \udc00 low'];
// Lengths around the 72-byte rate boundary and multi-block inputs.
for (var len = 0; len < 400; len += 7) {
  var s = '';
  for (var j = 0; j < len; j++) s += String.fromCharCode(32 + ((j * 131 + len) % 95));
  cases.push(s);
}
for (var r = 0; r < 200; r++) {
  var t = '';
  var n = nextInt(300);
  for (var k = 0; k < n; k++) t += String.fromCharCode(nextInt(0x10000));
  cases.push(t);
}

var failed = 0;
cases.forEach(function (input) {
  var expected = crypto.createHash('sha3-512').update(input).digest('hex');
  var actual = kernel.sha3_512(input);
  if (actual !== expected) {
    failed++;
    if (failed <= 3) console.log('  FAIL: ' + JSON.stringify(input).slice(0, 40));
  }
});

console.log('SHA3-512 fallback: ' + (cases.length - failed) + '/' + cases.length + ' match crypto');
if (failed > 0) process.exit(1);
