// Dev-only API fixtures for screenshot capture. NOT imported by src, NOT bundled.
// Shapes are inferred from src/types/api.ts and the fields each page reads; they are
// not an authoritative API contract. Unknown endpoints fall back to `{}`.
const now = Math.floor(Date.now() / 1000);
const pkgs = ['com.example.compass', 'com.example.wallet', 'com.example.launcher', 'com.example.gallery',
  'com.example.notes', 'com.example.music', 'com.example.weather', 'com.example.reader'];
const names = ['Compass', 'Wallet', 'Launcher', 'Gallery', 'Notes', 'Music', 'Weather', 'Reader with a deliberately long display name to test truncation'];
const st = ['done', 'running', 'failed', 'queued', 'done', 'done', 'discovered', 'done'];

const projects = [
  { id: 1, name: 'Example Holdings 2026 应用评估', company_name: 'Example Holdings', kind: 'company', brands: '["Alpha","Beta","Gamma"]', status: 'active', app_count: 63, inventory_count: 63, note: '年度评估', created_at: now - 86400 * 3 },
  { id: 2, name: 'Wallet 专项', kind: 'single', brands: '[]', status: 'active', app_count: 1, note: '', created_at: now - 86400 * 9 },
  { id: 3, name: 'Launcher 回归', kind: 'single', brands: '[]', status: 'closed', app_count: 4, note: null, created_at: now - 86400 * 30 },
];
const sessions = pkgs.slice(0, 6).map((p, i) => ({
  id: 40 + i, task_id: 100 + i, package: p, app_name: names[i], device: 'emulator-5554', status: ['ready', 'running', 'closed', 'ready', 'waiting_login', 'ready'][i],
  project_id: [1, 1, 2, 3, 1, null][i], created_at: now - 3600 * (i + 1), updated_at: now - 600 * (i + 1), packer: ['none', 'vendor-a', 'none', '', 'none', 'none'][i],
  runner: { running: i === 1 }, step: i * 2, total_steps: 12, progress_state: i === 1 ? 'live' : 'last_run',
}));
const tasks = pkgs.map((p, i) => ({
  id: 100 + i, kind: i % 3 === 2 ? 'unpack' : 'audit', app_name: names[i], package: p, apk_path: `/data/in/${p}.apk`, status: st[i] === 'discovered' ? 'queued' : st[i],
  created_at: now - 7200 * (i + 1), updated_at: now - 3000 * (i + 1), finished_at: st[i] === 'done' ? now - 2000 * (i + 1) : null, started_at: now - 7000 * (i + 1),
  result_id: st[i] === 'done' ? 500 + i : null,
  progress: st[i] === 'running' ? 'Unpack: 100% · 3 dex → Decompile: 42% · jadx 4200/10000 classes' : st[i] === 'done' ? (i % 4 === 1 ? '评估完成(脱壳不完整: 业务代码未脱出)' : '评估完成') : st[i] === 'failed' ? 'timeout while unpacking' : '',
  user: 'demo', operator: 'demo', user_id: 1 + (i % 2), error: st[i] === 'failed' ? 'timeout while unpacking' : '', error_msg: st[i] === 'failed' ? 'timeout while unpacking: device did not respond within 600s' : '',
  unpack_outcome: st[i] === 'done' ? (i % 4 === 1 ? { verdict: 'blocked', defined_biz: 0, code_recovered: 0, unpack_method: 'frida', diagnosis: { reason: 'dex dump returned stub classes only', checks: { zygisk_off: false, debuggable: true } } } : { biz_classes: 120 + i * 17, code_recovered: 1 }) : null,
  packer: i % 2 ? 'vendor-a' : 'none', version: `1.${i}.0`, size_mb: 12 + i,
}));
const apps = pkgs.map((p, i) => ({ id: i + 1, package: p, app_name: names[i], version: `1.${i}.0`, brand: ['Alpha', 'Beta', 'Gamma'][i % 3], ownership_tier: ['owned', 'affiliate', 'unknown'][i % 3], status: st[i], report_status: st[i] === 'done' ? 'ready' : '' }));
const candidates = pkgs.map((p, i) => ({ id: i + 1, package: p + '.lite', app_name: names[i] + ' Lite', developer: 'Example Ltd', source: ['play', 'aptoide', 'official'][i % 3], source_url: 'https://example.com/' + p, confidence: 0.4 + (i % 5) * 0.12, status: ['needs_verification', 'verified', 'downloaded', 'imported', 'manual_required', 'rejected'][i % 6], ownership_tier: ['owned', 'affiliate', 'unknown'][i % 3] }));
const reports = Array.from({ length: 11 }, (_, i) => ({ id: 32 - i, kind: i % 4 ? 'project' : 'app', template: ['technical', 'executive', 'forensic'][i % 3], status: i === 2 ? 'generating' : i === 6 ? 'failed' : 'ready', pages: 20 + i }));
const runs = [{ id: 7, status: 'done', total: 63, succeeded: 60, failed: 2, skipped: 1 }, { id: 6, status: 'running', total: 63, succeeded: 20, failed: 0, skipped: 0 }, { id: 5, status: 'failed', total: 10, succeeded: 3, failed: 7, skipped: 0 }];
const sev = { critical: { active: 1, total: 2 }, high: { active: 3, total: 5 }, medium: { active: 6, total: 9 }, low: { active: 4, total: 4 }, info: { active: 2, total: 2 } };
const providers = { active_id: 'p1', providers: [{ id: 'p1', name: 'Primary', kind: 'openai', base_url: 'https://llm.example.com/v1', model: 'model-large', enabled: true, healthy: true, latency_ms: 420 }, { id: 'p2', name: 'Fallback', kind: 'openai', base_url: 'https://llm2.example.com/v1', model: 'model-small', enabled: true, healthy: false, latency_ms: null }] };

// Report center (inferred shapes: only the fields the page reads).
const findingsOf = (sid) => {
  const mk = (id, state, severity, title, masvs, evidence, repro) => ({ id, state, severity, title, masvs, evidence, repro, rule_id: '', phase: 'static' });
  const confirmed = [
    mk('f1', 'confirmed', 'high', '示例发现: 明文传输', 'MASVS-NETWORK-1', 'com/example/net/Api.java:42\n    client.newCall(request)\nGET http://api.example.com/v1/profile\nHTTP/1.1 200 OK\n未启用传输加密', '改用 HTTPS 并校验证书'),
    mk('f2', 'confirmed', 'critical', '示例发现: 硬编码密钥', 'MASVS-CRYPTO-1', 'com/example/util/Keys.java:17\n    static final String KEY = "…"', '把密钥移入系统密钥库'),
    mk('f4', 'confirmed', 'medium', '示例发现: 可导出组件未设权限', 'MASVS-PLATFORM-1', 'AndroidManifest.xml:88', ''),
    mk('f5', 'confirmed', 'low', '示例发现: 日志输出敏感字段', 'MASVS-STORAGE-2', '', ''),
  ];
  const pending = [mk('f3', 'pending', 'medium', '示例发现: 调试标志开启', '', 'AndroidManifest.xml:12', ''), mk('f6', 'pending', 'low', '示例发现: 备份未关闭', 'MASVS-STORAGE-1', '', '')];
  const excluded = [mk('f7', 'excluded', 'info', '示例发现: 第三方库版本提示', '', '', '')];
  if (sid === 42) return { confirmed: [], pending: [], excluded: [], counts: { confirmed: 0, pending: 0, excluded: 0 } };
  return { confirmed, pending, excluded, counts: { confirmed: confirmed.length, pending: pending.length, excluded: excluded.length } };
};
const matrixOf = (sid) => {
  const colors = ['red', 'green', 'green', 'gray', 'green', 'red', 'green', 'gray', 'green', 'green', 'green', 'gray'];
  const rows = colors.map((color, i) => ({ path: `/api/v1/${['profile', 'orders', 'orders/{id}', 'static/app.js', 'payments', 'export/users', 'messages', 'health', 'cart', 'coupons', 'address', 'legacy/ping'][i]}`, color, anon_code: color === 'green' ? 401 : 200, ms: 40 + i * 7, final_url: `https://api.example.com/api/v1/${i}`, authed: i === 3 ? 'ui-verified' : 'skip' }));
  const count = (c) => rows.filter((r) => (r.authed === 'ui-verified' ? 'yellow' : r.color) === c).length;
  return { status: 'ok', base_url: 'https://api.example.com', rows, counts: { red: count('red'), yellow: count('yellow'), green: count('green'), gray: count('gray') }, stale: sid === 41, watermark: 120, watermark_now: 134 };
};

/** [method, RegExp on pathname, body | (url) => body] — first match wins. */
export const routes = [
  ['GET', /^\/api\/me$/, { username: 'demo', role: 'admin' }],
  ['GET', /^\/api\/user\/info$/, { username: 'demo', role: 'admin' }],
  ['GET', /^\/api\/pentest\/projects$/, projects],
  ['GET', /^\/api\/pentest\/projects\/\d+\/sessions$/, (u) => ({ sessions: sessions.filter((s) => String(s.project_id) === u.pathname.split('/')[4]).map((s, i) => ({ ...s, app: s.package, created: '2026-11-14 16:00', idle_days: i === 2 ? 9 : i === 1 ? 2 : 0 })) })],
  ['GET', /^\/api\/pentest\/projects\/\d+\/overview$/, { project: projects[0] }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/apps$/, { apps }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/candidates$/, { candidates }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/reports$/, { reports }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/runs$/, { runs }],
  ['GET', /^\/api\/pentest\/sessions$/, sessions],
  ['GET', /^\/api\/pentest\/sessions\/\d+$/, (u) => sessions.find((s) => String(s.id) === u.pathname.split('/')[4]) || sessions[0]],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/vulns\/grouped$/, { status: 'ok', cards: [{ rule_id: 'R-001', title: '示例发现: 明文传输', severity: 'high', masvs: 'MASVS-NETWORK-1', instance_count: 2, states: { confirmed: 2 }, instances: [{ id: 'f1', state: 'confirmed', severity: 'high', evidence: 'GET http://…' }, { id: 'f2', state: 'confirmed', severity: 'high' }] }, { rule_id: 'R-002', title: '示例发现: 调试标志开启', severity: 'medium', instance_count: 1, states: { candidate: 1 }, instances: [{ id: 'f3', state: 'candidate', severity: 'medium' }] }] }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/vulns$/, (u) => findingsOf(Number(u.pathname.split('/')[4]))],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/report\/summary$/, (u) => { const i = Number(u.pathname.split('/')[4]) - 40; return { risk_score: [72, 35, 0, 12, 48, 5][i] ?? 20, risk_level: ['高', '中', '低', '低', '中', '低'][i] ?? '低', confirmed_high: [3, 1, 0, 0, 2, 0][i] ?? 0, counts: { confirmed: 4 + i, pending: 2, excluded: 1 } }; }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/auth_matrix$/, (u) => { const sid = Number(u.pathname.split('/')[4]); return sid === 43 ? { status: 'error', rows: [] } : matrixOf(sid); }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/(report|apk-audit-report)$/, (u) => `# ${u.pathname.endsWith('apk-audit-report') ? '应用评估报告' : '动态验证报告'}\n\n- 应用: Example App\n- 包名: com.example.app\n- 版本: 1.0.0\n- 评估时间: 2026-11-14 16:00\n- 确认发现: 4\n- 待复核: 2\n- 风险等级: 高\n\n## 摘要\n\n本次评估共确认 4 条发现,其中 1 条需要优先处理。\n`],
  ['GET', /^\/api\/tasks\/\d+\/report-file$/, (u) => `# ${u.searchParams.get('name')}\n\n## 概述\n\n评估流程生成的报告文件示例内容。\n\n- 明文传输: 2 处\n- 调试标志开启: 1 处\n`],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/events/, { events: [], cursor: 0, total: 0 }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/graph$/, { status: 'ok', nodes: [], edges: [] }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/api_tree$/, { status: 'ok', groups: [] }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/approvals$/, { status: 'ok', approvals: [] }],
  ['GET', /^\/api\/pentest\/devices$/, [{ serial: 'emulator-5554', model: 'Pixel 6', android: '13', abi: 'arm64-v8a', root: true, frida: true }, { serial: 'R58M123ABC', model: 'SM-A515F', android: '12', root: false, frida: false }]],
  ['GET', /^\/api\/pentest\/vulns\/severity-summary$/, { total_active: 16, by_session: { 40: sev, 41: sev, 43: { high: { active: 1, total: 1 } } }, ...sev }],
  ['GET', /^\/api\/pentest\/vulns\/domain-summary$/, { domains: [], items: [] }],
  ['GET', /^\/api\/pentest\/events\/recent$/, { events: [] }],
  ['GET', /^\/api\/tasks$/, (u) => { const s = u.searchParams.get('status'); return s ? tasks.filter((t) => t.status === s) : tasks; }],
  ['GET', /^\/api\/tasks\/counts$/, (u) => ({ items: Object.fromEntries((u.searchParams.get('ids') || '').split(',').filter(Boolean).map((id, i) => [id, i % 3 === 2 ? { total: 0, critical: 0, high: 0, medium: 0, low: 0, sources: [] } : { total: 3 + i * 4, critical: i % 2, high: 1 + i, medium: 1 + i * 2, low: 1 + i - (i % 2), sources: ['audit', 'pentest'] }])), users: { 1: 'demo', 2: 'reviewer' } })],
  ['GET', /^\/api\/tasks-summary$/, { total: 128, running: 2, failed: 3, done: 110, queued: 13 }],
  ['GET', /^\/api\/tasks\/batch-unpack-summary$/, { count: 4, done: 2, failed: 1, avg_dur_s: 412, dex_total: 9, items: [{ task_id: 102, app_name: names[2], status: 'done', packer: 'vendor-a', method: 'frida', dex: 5, dur_s: 380 }, { task_id: 105, app_name: names[5], status: 'done', packer: 'none', method: 'static', dex: 4, dur_s: 444 }, { task_id: 108, app_name: 'Sample C', status: 'failed', packer: 'vendor-b', method: null, dex: null, dur_s: null }, { task_id: 109, app_name: 'Sample D', status: 'queued', packer: null, method: null, dex: null, dur_s: null }] }],
  ['GET', /^\/api\/tasks\/\d+\/skills$/, []],
  ['GET', /^\/api\/tasks\/\d+\/artifacts$/, (u) => { const pre = u.searchParams.get('prefix') || ''; if (!pre) return { run_dir: '/data/runs/task_100', entries: [{ type: 'dir', name: 'report', rel: 'report', files: 3 }, { type: 'dir', name: 'unpacked', rel: 'unpacked', files: 2 }, { type: 'file', name: 'run.log', rel: 'run.log', size_kb: 48 }] }; if (pre === 'report') return { entries: [{ type: 'file', name: 'security_report.md', rel: 'report/security_report.md', size_kb: 86 }, { type: 'file', name: 'executive_summary.md', rel: 'report/executive_summary.md', size_kb: 12 }, { type: 'file', name: 'security_report.json', rel: 'report/security_report.json', size_kb: 240 }] }; if (pre === 'unpacked') return { entries: [{ type: 'file', name: 'classes.dex', rel: 'unpacked/classes.dex', size_kb: 8420 }, { type: 'file', name: 'AndroidManifest.xml', rel: 'unpacked/AndroidManifest.xml', size_kb: 22 }] }; return { entries: [] }; }],
  ['GET', /^\/api\/tasks\/\d+\/artifact$/, (u) => `# ${u.searchParams.get('path')}\n\n示例文件内容。\n`],
  ['POST', /^\/api\/upload\/preview$/, { apk_path: '/data/in/com.example.compass.apk', filename: 'com.example.compass.apk', platform: 'android', size_mb: 48.2, sha256: '9f2c1a7b3d5e8f60a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718', abis: ['arm64-v8a', 'armeabi-v7a'], strong_shell: true, packer: 'vendor-a', meta: { app_name: 'Compass', package: 'com.example.compass', version_name: '3.2.1', version_code: 321, min_sdk: 24, target_sdk: 34, permissions_count: 18, components: { activity: { total: 42, exported: 3 }, service: { total: 9, exported: 1 }, receiver: { total: 6, exported: 2 }, provider: { total: 3, exported: 0 } } } }],
  ['GET', /^\/api\/org$/, { usage: { running: 2, quota_concurrent: 4 } }],
  ['GET', /^\/api\/nodes$/, { items: [{ id: 'n1', name: 'worker-1', status: 'online', running: 2, capacity: 4 }] }],
  ['GET', /^\/api\/notifications$/, { unread: 2, items: [{ id: 1, kind: 'task', level: 'success', title: '任务已完成', body: 'Compass 评估完成', created_at: now - 300, read_at: null, link: '/tasks' }, { id: 2, kind: 'system', level: 'info', title: '报告已就绪', body: '#32 项目总报告', created_at: now - 900, read_at: null, link: '/reports' }, { id: 3, kind: 'task', level: 'danger', title: '任务失败', body: 'Wallet 评估在静态分析阶段停止', created_at: now - 4000, read_at: now - 3000, link: '/tasks?focus=103' }] }],
  ['GET', /^\/api\/models\/providers$/, providers],
  ['GET', /^\/api\/models\/routing$/, { routing: { default: 'p1', chat: 'p1', audit: 'p1' } }],
  ['GET', /^\/api\/models\/catalog$/, { models: [] }],
  ['GET', /^\/api\/skills$/, [1, 2, 3, 4, 5].map((i) => ({ id: i, name: `示例知识条目 ${i}`, slug: `sample-${i}`, summary: '从已完成任务中沉淀的可复用分析步骤。', description: '从已完成任务中沉淀的可复用分析步骤。', status: ['active', 'draft', 'disabled', 'active', 'active'][i - 1], tags: ['network', 'storage'], category: ['network', 'storage', 'crypto'][i % 3], source: 'distill', updated_at: now - i * 5000, created_at: now - i * 9000, owner: 'demo', version: 1 }))],
  ['GET', /^\/api\/kb\/candidates$/, { items: [1, 2, 3].map((i) => ({ id: i, title: `候选条目 ${i}`, summary: '待审核的知识候选。', status: 'pending', kind: 'pattern', score: 0.6 + i / 10, created_at: now - i * 4000, task_id: 100 + i })) }],
  ['GET', /^\/api\/v2\/overview$/, { tasks_total: 8, candidates_total: 83, confirmed_total: 12, real_confirmed: 9, synthetic_confirmed: 3, silver_total: 20, unresolved_total: 51, apk_with_confirmed: 5, sink_families: 7,
    tasks: pkgs.map((p, i) => ({ task: p, paths: 10 + i, dataflow: 3 + i })),
    confirmed: pkgs.slice(0, 5).map((p, i) => ({ hypothesis_id: `hyp-${p}-${i}-abcdef0123456789`, task: p, provenance: ['webview', 'file', 'intent'][i % 3], device: 'emulator-5554', finding_id: `F-${100 + i}`, proof_level: ['dynamic', 'static'][i % 2], synthetic: i === 4, source: 'verifier' })),
    pipeline: [{ id: 'ingest', label: '接入', state: 'done' }, { id: 'extract', label: '提取', state: 'done' }, { id: 'verify', label: '核验', state: 'active' }, { id: 'report', label: '报告', state: 'todo' }] }],
  ['GET', /^\/api\/chat\/sessions$/, [{ id: 1, title: '示例对话', updated_at: now - 500, pinned: false, task_ids: [100] }]],
  ['GET', /^\/api\/chat\/sessions\/\d+$/, { id: 1, title: '示例对话', messages: [{ role: 'user', content: '总结这个应用的主要发现。' }, { role: 'assistant', content: '共 **3** 条发现,其中 1 条需要优先处理。\n\n- 明文传输\n- 调试标志开启' }] }],
  ['GET', /^\/api\/chat\/usage-summary$/, { total_tokens: 1234, calls: 2 }],
  ['GET', /^\/api\/agent\/sessions$/, [{ id: 'a1', title: '示例 Agent 会话', status: 'idle', created_at: now - 4000, updated_at: now - 300 }]],
  ['GET', /^\/api\/agent\/sessions\/[^/]+\/snapshot$/, { session: { id: 'a1', title: '示例 Agent 会话', status: 'idle' }, events: [], turns: [], messages: [], last_seq: 0 }],
  ['GET', /^\/api\/agent\/settings$/, { web_enabled: false }],
  ['GET', /^\/api\/agent\/web\/status$/, { enabled: false }],
  ['GET', /^\/api\/system\/resource-stats$/, { cpu: 23, mem: 61, disk: 48, uptime: 86400, workers: 4 }],
  ['GET', /^\/api\/users$/, [{ id: 1, username: 'demo', role: 'admin', created_at: now - 9e6 }, { id: 2, username: 'analyst', role: 'user', created_at: now - 4e6 }]],
  ['GET', /^\/api\/audit-log$/, { items: [{ id: 1, ts: now - 100, user: 'demo', action: 'login', target: '', ip: '127.0.0.1' }], total: 1 }],
  ['GET', /^\/api\/tokens$/, { items: [] }],
  ['GET', /^\/api\/webhooks$/, { items: [] }],
  ['GET', /^\/api\/apk\/pool-state$/, { cached: [{ pkg: 'com.example.compass', path: '/data/in/com.example.compass.apk', size: 50541363 }, { pkg: 'com.example.wallet', path: '/data/pool/com.example.wallet.apk', size: 31457280 }], parts: [] }],
];

export function resolve(method, url) {
  for (const [m, re, body] of routes) {
    if (m === method && re.test(url.pathname)) return typeof body === 'function' ? body(url) : body;
  }
  return {};
}
