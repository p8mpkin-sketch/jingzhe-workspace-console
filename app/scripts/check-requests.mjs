#!/usr/bin/env node
// Dev-only: compare a capture request log with the baseline recorded on the untouched branch.
// Usage: node scripts/capture.mjs --requests /tmp/req.json … && node scripts/check-requests.mjs /tmp/req.json
import fs from 'node:fs';
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/requests-baseline.json', import.meta.url), 'utf8'));
const cur = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let bad = 0;
for (const route of new Set([...Object.keys(base), ...Object.keys(cur)])) {
  const a = new Set(base[route] || []), b = new Set(cur[route] || []);
  const gone = [...a].filter((x) => !b.has(x)), added = [...b].filter((x) => !a.has(x));
  if (gone.length || added.length) { bad++; console.log(route); gone.forEach((x) => console.log('  - ' + x)); added.forEach((x) => console.log('  + ' + x)); }
}
console.log(bad ? `${bad} route(s) differ from baseline` : `request logs identical to baseline (${Object.keys(base).length} routes)`);
process.exit(bad ? 1 : 0);
