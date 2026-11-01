// npm run demo:docs: writes the demo's four starting docs as .phir files into demo-files/ (for the
// pen drive), and as src/demo/starting-files.ts (so the demo setup page works offline). Prints each
// file's size and how long one beam of it takes. Same bytes every run.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine } from '../src/model';
import { BEAM_BYTES_PER_SECOND, BEAM_SECONDS_CAP, startingFiles } from '../src/demo/scenario';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'demo-files');

const files = startingFiles(engine);

mkdirSync(outDir, { recursive: true });
for (const old of readdirSync(outDir)) if (old.endsWith('.phir')) rmSync(join(outDir, old));
for (const f of files.docs) writeFileSync(join(outDir, f.fileName), f.bytes);

const lines = [
  '// Made by `npm run demo:docs` from src/demo/scenario.ts. Do not edit by hand; run the script again.',
  '// The demo setup page reads these, so it needs no file picker and works offline.',
  '',
  'export const STARTING_FILES = {',
  ...files.docs.map(
    (f) =>
      `  ${f.who}: {\n    fileName: ${JSON.stringify(f.fileName)},\n    size: ${f.bytes.length},\n    phir: '${Buffer.from(f.bytes).toString('base64')}',\n  },`,
  ),
  '} as const;',
  '',
  '/** Base camp after catching Rina and Tanmoy too: the biggest the doc gets on stage. */',
  `export const EVERYTHING_SIZE = ${files.everything.length};`,
  '',
];
writeFileSync(join(root, 'src', 'demo', 'starting-files.ts'), lines.join('\n'));

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const secs = (n: number) => `${(n / BEAM_BYTES_PER_SECOND).toFixed(1)} s`;
const rows = [
  ...files.docs.map((f) => [f.fileName, f.bytes.length]),
  ['(the whole demo doc, after every catch)', files.everything.length],
] as [string, number][];

console.log(`Wrote ${files.docs.length} files to demo-files/ and src/demo/starting-files.ts`);
console.log(`Beam time at ${BEAM_BYTES_PER_SECOND / 1024} KB a second (the estimate until the beam test's number):`);
for (const [name, size] of rows) console.log(`  ${kb(size).padStart(8)}  ${secs(size).padStart(6)}  ${name}`);

const tooBig = rows.filter(([, size]) => size / BEAM_BYTES_PER_SECOND > BEAM_SECONDS_CAP);
if (tooBig.length) {
  console.error(`Too big: ${tooBig.map(([n]) => n).join(', ')} would take over ${BEAM_SECONDS_CAP} seconds to beam.`);
  process.exit(1);
}
console.log(`Every file beams in under ${BEAM_SECONDS_CAP} seconds.`);
