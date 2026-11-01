// npm run selftest: the two-versions script test from docs/plan/3-how-its-built.md, section 6.2.
// Three phones work apart on one Camp log, then every phone catches every other in 1,000 shuffled orders.

import { runTwoVersionsScript } from '../src/model/script';

const orders = Number(process.argv[2] ?? 1000);
const started = Date.now();
const result = runTwoVersionsScript(orders);

console.log('Phir Milenge: the two-versions script test');
console.log('');
result.steps.forEach((s, i) => {
  console.log(`${i + 1}. ${s.title}: ${s.passed ? 'passed' : 'FAILED'}`);
  console.log(`   ${s.detail}`);
});
console.log('');
for (const [name, f] of Object.entries(result.phones)) {
  console.log(`${name.padEnd(10)} ${f.words.join(' ')} ${f.digits}`);
}
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} seconds)`);
console.log('');
if (result.passed) {
  console.log(`${result.same} of ${result.runs} the same: ${result.fingerprint.words.join(' ')}`);
} else {
  console.log(`FAILED: ${result.same} of ${result.runs} the same`);
  process.exitCode = 1;
}
