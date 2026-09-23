// Builds the reader runtime and reports its gzipped size against the 150 KB budget.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;
execSync('pnpm build:player', { stdio: 'inherit' });
let total = 0;
for (const file of ['dist-player/player.js', 'dist-player/player.css']) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  const gz = gzipSync(buf, { level: 9 }).length;
  total += gz;
  console.log(
    `${file.padEnd(26)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  gzip ${(gz / 1024).toFixed(1).padStart(6)} KB`,
  );
}
console.log(`Total gzip: ${(total / 1024).toFixed(1)} KB (budget ${BUDGET_KB} KB)`);
if (total / 1024 > BUDGET_KB) {
  console.error('Player bundle exceeds the size budget.');
  process.exit(1);
}
