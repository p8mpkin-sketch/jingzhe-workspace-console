#!/usr/bin/env node
// Dev-only: compare a capture request log with the baseline recorded on the untouched branch.
// Usage: node scripts/capture.mjs --requests /tmp/req.json … && node scripts/check-requests.mjs /tmp/req.json
import fs from 'node:fs';
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/requests-baseline.json', import.meta.url), 'utf8'));
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// V3 renamed and merged routes; the baseline was recorded under the pre-V3 paths. A moved page is compared with the
// baseline of the page it replaces, and a merged page with the union of the pages it replaces: it may issue every
// request they issued and nothing else.
const ALIAS = {
  '/projects': ['/company', '/pentest'], '/projects/1': ['/company/projects/1', '/pentest/project/1'],
  '/projects/1/sessions/40': ['/pentest/project/1/session/40'],
  '/new-assessment': ['/new-audit'], '/evidence': ['/discovery'], '/knowledge': ['/skills'],
};
const expected = {}; const merged = new Set();
for (const [route, list] of Object.entries(base)) expected[route] = list;
for (const [route, from] of Object.entries(ALIAS)) {
  expected[route] = [...new Set(from.flatMap((k) => base[k] || []))];
  from.forEach((k) => { delete expected[k]; merged.add(k); });
}
const cur = raw;
const VIEW_PATHS = new Set(['/projects', '/projects/1']);
// The runs tab is the task model filtered to the project: while it is open it reads the two lists /tasks reads.
const VIEW_EXTRA = { '/projects/1?tab=runs': ['GET /api/tasks?limit=2000', 'GET /api/pentest/sessions'] };
let bad = 0;
const unknown = [];
for (const route of new Set([...Object.keys(expected), ...Object.keys(cur)])) {
  // A sub-view (scope, tab) must issue what its route issues; VIEW_EXTRA lists the requests a view adds on purpose.
  const path = route.split('?')[0];
  const want = expected[route] || (VIEW_PATHS.has(path) && expected[path] ? [...expected[path], ...(VIEW_EXTRA[route] || [])] : null);
  if (!want) { unknown.push(route); continue; } // a route with no pre-V3 baseline (listed, not judged)
  const a = new Set(want), b = new Set(cur[route] || []);
  const gone = [...a].filter((x) => !b.has(x)), added = [...b].filter((x) => !a.has(x));
  if (gone.length || added.length) { bad++; console.log(route); gone.forEach((x) => console.log('  - ' + x)); added.forEach((x) => console.log('  + ' + x)); }
}
if (unknown.length) console.log(`no baseline for: ${unknown.join(', ')}`);
console.log(bad ? `${bad} route(s) differ from baseline` : `request logs identical to baseline (${Object.keys(expected).length} routes; ${merged.size} pre-V3 pages folded into ${Object.keys(ALIAS).length})`);
process.exit(bad ? 1 : 0);
