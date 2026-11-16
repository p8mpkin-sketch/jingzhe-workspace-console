#!/usr/bin/env node
// Fixture check for the source slice on the application-structure canvas (Phase 17).
// A manifest component may be relative (".MainActivity"). The real backend refuses "/MainActivity.java" as outside the
// decompiled tree, so the canvas must resolve the name against the session package first. This opens ?view=structure
// with one relative component, double-clicks it with a real pointer event and checks the request path and the dialog.
//   node scripts/check-source-slice.mjs        (against vite preview, default :4173)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { resolve: fixture } = await import('./fixtures/api.mjs');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('token', 'fixture-token'));
const p = await ctx.newPage();
await p.route('**/api/**', async (r) => { const u = new URL(r.request().url()); if (/\/stream$/.test(u.pathname)) return; let body = fixture(r.request().method(), u);
  if (/\/sessions\/40\/graph$/.test(u.pathname)) body = { status: 'ok', nodes: [{ id: 'app:x', type: 'app', label: 'com.example.compass', meta: { package: 'com.example.compass' } }, { id: 'comp:.MainActivity', type: 'component', label: 'MainActivity', meta: { full_name: '.MainActivity', kind: 'activity', exported: true } }], edges: [{ from: 'app:x', to: 'comp:.MainActivity' }] };
  if (/\/sessions\/40$/.test(u.pathname)) body = { ...body, package: 'com.example.compass', task_id: 100 };
  if (u.pathname === '/api/chat/source') { globalThis.srcPaths = [...(globalThis.srcPaths || []), u.searchParams.get('path')]; if (u.searchParams.get('path') !== 'com/example/compass/MainActivity.java') return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: '路径越界' }) }); body = { path: 'com/example/compass/MainActivity.java', content: 'package com.example.compass;\n\npublic class MainActivity {}\n', truncated: false }; } return r.fulfill({ status: 200, contentType: typeof body === 'string' ? 'text/plain' : 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }); });
await p.goto((process.env.BASE || 'http://localhost:4173/v2/') + '#/pentest/project/1/session/40?view=structure'); await p.waitForTimeout(4000);
const ids = await p.$$eval('[data-node-id]', (els) => els.map((e) => e.getAttribute('data-node-id')));
const comp = ids.find((i) => i && i.startsWith('comp:'));
if (comp) { try { await p.dblclick(`[data-node-id="${comp}"]`, { timeout: 5000 }); globalThis.dbl = true; } catch (e) { globalThis.dbl = false; globalThis.dblErr = e.message.split('\n')[0]; } }
await p.waitForTimeout(1500); globalThis.lastPre = await p.locator('pre').allTextContents(); await b.close();
const pre = globalThis.lastPre || [];

const pass = globalThis.dbl === true && (globalThis.srcPaths || []).length === 1 && globalThis.srcPaths[0] === 'com/example/compass/MainActivity.java' && pre.some((t) => t.startsWith('package '));
console.log(JSON.stringify({ pass, dblclick: globalThis.dbl, dblclickError: globalThis.dblErr, sourcePaths: globalThis.srcPaths || [], dialogShowsSource: pre.some((t) => t.startsWith('package ')) }, null, 1));
process.exit(pass ? 0 : 1);
