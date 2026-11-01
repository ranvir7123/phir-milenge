// npm run selftest: the two-versions script test from docs/plan/3-how-its-built.md, section 6.2.
// Three phones work apart on one Camp log, then every phone catches every other in 1,000 shuffled orders.

import { measure } from '../src/model/measure';
import { runTwoVersionsScript } from '../src/model/script';

// npm run selftest -- measure: how long a 20,000-change doc takes to open and show.
if (process.argv[2] === 'measure') {
  const total = Number(process.argv[3] ?? 20_000);
  const built = Date.now();
  const m = measure(total);
  const f = (n: number) => `${Math.round(n)} ms`;
  console.log(`Relay Docs: a doc of ${m.changes} changes (${m.edits} edits, the rest notes), from 4 phones`);
  console.log(`(made in ${((Date.now() - built) / 1000).toFixed(1)} seconds, measuring included)`);
  console.log('');
  m.rounds.forEach((r, i) =>
    console.log(
      `Run ${i + 1}: openDoc ${f(r.openDoc)}, first view ${f(r.view)}, truck back ${f(r.fingerprint)}, catch 1 more change and show it ${f(r.receiveOne)}`,
    ),
  );
  console.log('');
  console.log(`.phir file: ${(m.phirBytes / 1024).toFixed(0)} KB (the changes as JSON: ${(m.jsonBytes / 1024).toFixed(0)} KB)`);
  console.log(`encodePhir ${f(m.encode)}, decodePhir ${f(m.decode)}`);
  process.exit(0);
}

const orders = Number(process.argv[2] ?? 1000);
const started = Date.now();
const result = runTwoVersionsScript(orders);

console.log('Relay Docs: the two-versions script test');
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
