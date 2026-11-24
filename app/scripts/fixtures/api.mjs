// Dev-only API fixtures for screenshot capture. NOT imported by src, NOT bundled.
// Shapes are inferred from src/types/api.ts and the fields each page reads; they are
// not an authoritative API contract. Unknown endpoints fall back to `{}`.
import { liveCards, shadowCards, baseCards, liveGraph, liveFacts, liveCredentials } from './evidence.mjs';
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
const catalog = { active_model: 'model-large', models: [{ value: 'model-large', provider_label: 'Primary', catalog_name: 'Model Large' }, { value: 'model-small', provider_label: 'Fallback', catalog_name: 'Model Small' }] };

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

// Workbench of a running session (sid 41): phases, steps, progress events, two approvals waiting, review rounds.
// Other sessions keep the empty answers, so the "not started" workbench stays covered.
export const LIVE_SID = 41;
const sidOf = (u) => Number(u.pathname.split('/')[4]);
export const stamp = (secAgo) => new Date(Date.now() - secAgo * 1000).toISOString().slice(0, 19).replace('T', ' ');
export const livePhases = [
  { phase: 'P0', name: '范围确认', done: 2, total: 2 }, { phase: 'P1', name: '静态检查', done: 4, total: 4 },
  { phase: 'P2', name: '权限矩阵', done: 3, total: 6 }, { phase: 'P3', name: '会话状态检查', done: 0, total: 4 },
  { phase: 'P5', name: '报告汇总', done: 0, total: 2 },
];
export const liveSteps = [
  ['P0', '读取应用清单', 'manifest_read', 'ok', 0], ['P0', '确认评估范围', 'scope_check', 'ok', 0],
  ['P1', '反编译与索引', 'decompile', 'ok', 0], ['P1', '配置项检查', 'config_scan', 'ok', 1], ['P1', '网络配置检查', 'network_scan', 'ok', 1], ['P1', '存储项检查', 'storage_scan', 'ok', 0],
  ['P2', '接口清单梳理', 'api_inventory', 'ok', 0], ['P2', '匿名访问核对', 'anon_check', 'ok', 1], ['P2', '登录态访问核对', 'authed_check', 'ok', 0],
  ['P2', '越权访问核对', 'scope_matrix', 'running', 0], ['P2', '导出组件核对', 'component_check', 'pending', 0], ['P2', '矩阵汇总', 'matrix_summary', 'pending', 0],
  ['P3', '会话有效期核对', 'session_ttl', 'pending', 0], ['P3', '令牌刷新核对', 'token_refresh', 'pending', 0], ['P3', '登出核对', 'logout_check', 'pending', 0], ['P3', '多端登录核对', 'multi_login', 'pending', 0],
  ['P5', '汇总发现', 'collect', 'pending', 0], ['P5', '生成报告', 'report_build', 'pending', 0],
].map(([phase, name, tool, state, findings]) => ({ phase, name, tool, state, findings }));
export const liveEvents = () => {
  const out = [{ type: 'autopilot_start', ts: stamp(2467), title: '分析引擎启动' }];
  let t = 2400;
  for (const st of liveSteps.filter((x) => x.state !== 'pending')) {
    out.push({ type: 'step_start', ts: stamp(t), phase: st.phase, tool: st.tool, name: st.name });
    t -= 190;
    if (st.state === 'ok') out.push({ type: 'step_done', ts: stamp(t), phase: st.phase, tool: st.tool, name: st.name });
    t -= 40;
  }
  // One operator guidance (a judgment written by a person) and one failed call with its full reason.
  out.push({ type: 'clue_consumed', ts: stamp(150), phase: 'P2', title: '引导已读取', detail: '订单接口优先核对 /api/v1/orders/{id}，先不要动支付接口。', user: 'demo' });
  out.push({ type: 'tool_error', ts: stamp(120), phase: 'P2', title: '重放请求没有完成', detail: 'replay_request 在 30 秒内没有收到响应：测试设备 emulator-5554 的代理端口 18081 拒绝连接（ECONNREFUSED）。已跳过这一次重放，矩阵里对应的格子保持未测。' });
  out.push({ type: 'react_decision', ts: stamp(95), phase: 'P2', title: '先核对订单接口的越权访问', detail: '匿名与登录态结果一致，下一步换用第二个账号重放。' });
  out.push({ type: 'approval_required', ts: stamp(60), phase: 'P2', title: '待人工确认：在测试设备上重放请求' });
  return out.map((e, i) => ({ id: `ev-${i}`, seq: i + 1, ...e }));
};
export const liveApprovals = () => [
  { id: 'ap-1', tool: 'replay_request', name: '在测试设备上重放请求', reason: '用第二个测试账号重放 3 个订单接口，只读，不修改数据。', state: 'pending', ts: stamp(60) },
  { id: 'ap-2', tool: 'export_component', name: '启动导出组件', reason: '需要在测试设备上启动 1 个导出页面以核对访问控制。', state: 'pending', ts: stamp(20) },
];
const liveRounds = { status: 'ok', running: false, can_recompute: true, rounds: [
  { round: 1, status: 'ok', added: 3 }, { round: 2, status: 'ok', added: 1 }, { round: 3, status: 'ok', reviewed: 4 }, { round: 4, status: 'degraded', targets: 2 }, { round: 5, status: 'ok' },
] };

// Requests of the running session: a small inventory (two modules, one of them captured traffic) and six flows.
const liveApiTree = { status: 'ok', base_url: 'https://api.example.com', tiers: { traffic: 2, host: 3, guess: 1 }, groups: [
  { module: 'api.example.com', source: 'traffic', apis: [
    { method: 'GET', path: '/api/v1/orders', host: 'api.example.com', verified: 'traffic', hits: 6, auth_hits: 6, codes: { 200: 6 }, tested: 'probe_ok', params: ['page', 'size'], param_spec: { page: 'query', size: 'query' } },
    { method: 'GET', path: '/api/v1/orders/{id}', host: 'api.example.com', verified: 'traffic', hits: 3, auth_hits: 2, codes: { 200: 2, 401: 1 }, tested: 'unauth', params: ['id'], param_spec: { id: 'path' }, probed: true, last_probe: { code: '200', size: 812, ctype: 'application/json', url: 'https://api.example.com/api/v1/orders/1002', body_snip: '{"id":1002,"owner":"…"}' }, evidence: 'com/example/wallet/net/OrderApi.java:31' },
  ] },
  { module: '账户', apis: [
    { method: 'POST', path: '/api/v1/login', domain: 'api.example.com', tier: 'host', tested: 'sign_required', biz_cn: '登录', params: ['phone', 'code'], evidence: 'com/example/wallet/net/AuthApi.java:18' },
    { method: 'GET', path: '/api/v1/profile', domain: 'api.example.com', tier: 'host', tested: 'probe_ok', biz_cn: '个人资料' },
    { method: 'PUT', path: '/api/v1/profile/avatar', domain: 'api.example.com', tier: 'host', biz_cn: '更新头像' },
    { method: 'GET', path: '/internal/debug/config', tier: 'guess', biz_cn: '调试配置' },
  ] },
] };
const liveFlows = () => [['GET', '/api/v1/orders', '200', 1840, true], ['GET', '/api/v1/orders/1001', '200', 790, true], ['GET', '/api/v1/orders/1002', '401', 64, false], ['POST', '/api/v1/login', '200', 310, false], ['GET', '/api/v1/profile', '200', 420, true], ['GET', '/static/app.js', '304', 0, false]]
  .map(([method, path, code, size, auth], i) => ({ seq: i + 1, ts: stamp(600 - i * 45), type: 'pkt', host: 'api.example.com', path, method, code, size, auth, url: `https://api.example.com${path}` }));

/** [method, RegExp on pathname, body | (url) => body] — first match wins. */
export const routes = [
  ['GET', /^\/api\/me$/, { username: 'demo', role: 'admin' }],
  ['GET', /^\/api\/user\/info$/, { username: 'demo', role: 'admin' }],
  // FIXTURE_PROJECTS=n trims the project list (index screenshots with 0, 1 or 2 projects).
  ['GET', /^\/api\/pentest\/projects$/, () => (process.env.FIXTURE_PROJECTS != null ? projects.slice(0, Number(process.env.FIXTURE_PROJECTS)) : projects)],
  ['GET', /^\/api\/pentest\/projects\/\d+\/sessions$/, (u) => ({ sessions: sessions.filter((s) => String(s.project_id) === u.pathname.split('/')[4]).map((s, i) => ({ ...s, app: s.package, created: '2026-11-14 16:00', idle_days: i === 2 ? 9 : i === 1 ? 2 : 0 })) })],
  ['GET', /^\/api\/pentest\/projects\/\d+\/overview$/, { project: projects[0] }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/apps$/, { apps }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/candidates$/, { candidates }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/reports$/, { reports }],
  ['GET', /^\/api\/pentest\/projects\/\d+\/runs$/, { runs }],
  ['GET', /^\/api\/pentest\/sessions$/, sessions],
  ['GET', /^\/api\/pentest\/sessions\/\d+$/, (u) => sessions.find((s) => String(s.id) === u.pathname.split('/')[4]) || sessions[0]],
  // The running session carries the larger set (findings and evidence surfaces); every other session keeps the two base cards.
  ['GET', /^\/api\/pentest\/sessions\/\d+\/vulns\/grouped$/, (u) => ({ status: 'ok', cards: sidOf(u) !== LIVE_SID ? baseCards : u.searchParams.get('source') === 'shadow' ? shadowCards : liveCards })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/vulns$/, (u) => findingsOf(Number(u.pathname.split('/')[4]))],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/report\/summary$/, (u) => { const i = Number(u.pathname.split('/')[4]) - 40; return { risk_score: [72, 35, 0, 12, 48, 5][i] ?? 20, risk_level: ['高', '中', '低', '低', '中', '低'][i] ?? '低', confirmed_high: [3, 1, 0, 0, 2, 0][i] ?? 0, counts: { confirmed: 4 + i, pending: 2, excluded: 1 } }; }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/auth_matrix$/, (u) => { const sid = Number(u.pathname.split('/')[4]); return sid === 43 ? { status: 'error', rows: [] } : matrixOf(sid); }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/(report|apk-audit-report)$/, (u) => `# ${u.pathname.endsWith('apk-audit-report') ? '应用评估报告' : '动态验证报告'}\n\n- 应用: Example App\n- 包名: com.example.app\n- 版本: 1.0.0\n- 评估时间: 2026-11-14 16:00\n- 确认发现: 4\n- 待复核: 2\n- 风险等级: 高\n\n## 摘要\n\n本次评估共确认 4 条发现,其中 1 条需要优先处理。\n`],
  ['GET', /^\/api\/tasks\/\d+\/report-file$/, (u) => `# ${u.searchParams.get('name')}\n\n## 概述\n\n评估流程生成的报告文件示例内容。\n\n- 明文传输: 2 处\n- 调试标志开启: 1 处\n`],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/autopilot\/status$/, (u) => (sidOf(u) === LIVE_SID ? { state: 'running', status: 'running', current: 'P2', current_name: '权限矩阵', phases: livePhases } : {})],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/timeline$/, (u) => (sidOf(u) === LIVE_SID ? { steps: liveSteps } : {})],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/security-rounds$/, (u) => (sidOf(u) === LIVE_SID ? liveRounds : {})],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/events/, (u) => (sidOf(u) !== LIVE_SID ? { events: [], cursor: 0, total: 0 } : u.searchParams.get('source') === 'progress' ? { events: liveEvents(), cursor: 0, total: 0 } : u.searchParams.get('source') === 'bridge' ? { events: liveFlows(), cursor: 0, total: 0 } : { events: [], cursor: 0, total: 0 })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/graph$/, (u) => (sidOf(u) === LIVE_SID ? liveGraph() : { status: 'ok', nodes: [], edges: [] })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/fact-graph$/, (u) => (sidOf(u) === LIVE_SID ? liveFacts : {})],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/api_tree$/, (u) => (sidOf(u) === LIVE_SID ? liveApiTree : { status: 'ok', groups: [] })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/packer$/, { status: 'ok', family: 'example-shell', family_confidence: 82, family_evidence: ['lib/arm64-v8a/libshell.so'], kb_status: { verified: 1 }, vectors: { frida: [{ evidence: 'strstr(maps, "frida")', match: 'frida', file: 'lib/arm64-v8a/libshell.so' }], root: [{ evidence: 'access("/system/xbin/su")', match: 'su', file: 'classes2.dex' }], emulator: [], ptrace: [{ evidence: 'ptrace(PTRACE_TRACEME)', match: 'ptrace', file: 'lib/arm64-v8a/libshell.so' }], proxy: [], debug: [] }, libs: [{ so: 'libshell.so', size: 1843200, sigs: [{ family: 'example-shell', sig: 'JNI_OnLoad stub' }] }] }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/llm-usage$/, { by_phase: [{ phase: 'P1', count: 14, prompt_tokens: 41200, completion_tokens: 6800, avg_latency_ms: 2100 }, { phase: 'P3', count: 9, prompt_tokens: 22050, completion_tokens: 4100, avg_latency_ms: 1850 }], by_skill: [], total: { count: 23, prompt_tokens: 63250, completion_tokens: 10900, avg_latency_ms: 2002, synthetic_count: 0, real_count: 23 } }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/credentials$/, (u) => (sidOf(u) === LIVE_SID ? liveCredentials : { source: 'report csv', items: [{ category: 'API Key', name: 'MAP_SDK_KEY', value: 'AIza…example', location: 'res/values/strings.xml', purpose: '地图 SDK', risk: '中', fix: '改为服务端下发' }, { category: 'Endpoint', name: 'STAGING_HOST', value: 'https://staging.example.com', location: 'com/example/net/Env.java:18', purpose: '预发环境', risk: '低', fix: '发布包移除预发地址' }] })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/burp\/status$/, (u) => ({ status: 'ok', device_online: true, device_serial: 'emulator-5554', oracle: false, bridge: sidOf(u) === LIVE_SID, o_port: 18080, b_port: 18081, burp: false, phone_proxy: sidOf(u) === LIVE_SID ? '10.0.2.2:18081' : '' })],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/burp\/plugin$/, { status: 'ok', generated: false, file_name: null, mtime: null, samples: { ok: false, runs: 1, unique_pairs: 3, usable_cipher: 2, usable_mac: 0, custom: 0, reason: '样本不足：至少需要 8 组明密文样本' } }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/vulns\/clusters$/, { real: 3, clusters: 2, noise: 0, reduction: 0.33, items: [{ cluster_id: 'c1', count: 2, family: 'cleartext-transport', host: 'api.example.com', path_template: '/v1/user/{id}', title: '示例发现: 明文传输', confirmed: 2 }, { cluster_id: 'c2', count: 1, family: 'debug-flag', host: '', path_template: '', title: '示例发现: 调试标志开启', confirmed: 0 }] }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/mission\/status$/, { state: 'idle' }],
  ['GET', /^\/api\/pentest\/sessions\/\d+\/approvals$/, (u) => ({ status: 'ok', approvals: sidOf(u) === LIVE_SID ? liveApprovals() : [] })],
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
  // The real backend returns a non-empty catalog, so the agent composer never falls back to /api/models/providers
  // (Phase 17 real read audit). FIXTURE_CATALOG=empty reproduces the fallback path.
  ['GET', /^\/api\/models\/catalog$/, () => (process.env.FIXTURE_CATALOG === 'empty' ? { models: [] } : catalog)],
  ['GET', /^\/api\/skills\/\d+\/source$/, { file: 'skills/sample/SKILL.md', bytes: 212, truncated: false, content: '# 示例知识条目\n# 用途: 复用已完成任务中的分析步骤\n\n1. 读取任务产物清单\n2. 核对网络与存储相关发现\n3. 汇总结论并附出处\n' }],
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
