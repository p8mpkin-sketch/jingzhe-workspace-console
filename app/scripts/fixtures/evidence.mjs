// Dev-only fixtures for the findings and evidence surfaces of the running session (sid 41). NOT imported by src.
// Shapes are inferred from the fields the surfaces read; they are not an API contract. All names are examples.

const inst = (id, state, severity, evidence, extra = {}) => ({ id, state, severity, evidence, ...extra });

/** Credential detail of one instance: exercises every block of the finding detail. The value is a placeholder. */
const credential = {
  kind: 'api_key', label: 'API 密钥', summary: '源码里写有一个第三方服务的密钥，随安装包分发。', confidence: 'high',
  proof: 'com/example/wallet/util/Keys.java:17\n    static final String PAY_KEY = "sk_test_…example";',
  poc_steps: ['在反编译结果里打开 Keys.java 第 17 行，核对常量值。', '（动态，待执行）在测试设备上观察这个密钥是否出现在请求头里。'],
  code_info: { file: 'com/example/wallet/util/Keys.java', line: 17, language: 'java', scope: 'com.example.wallet.util.Keys', context: 'public final class Keys {\n    static final String PAY_KEY = "sk_test_…example";\n    static final String PAY_HOST = "https://pay.example.com";\n}' },
  secret: { name: 'PAY_KEY', value: 'sk_test_…example', entropy: 4.1, type: 'api_key' },
  context: {
    type: '第三方支付密钥', scope: 'com.example.wallet.util.Keys', summary: 'PAY_KEY 在创建支付请求时被放进请求头。', confidence: 'high',
    call_chain: ['PayActivity.onConfirm()', 'PayClient.create(order)', 'Keys.PAY_KEY'],
    endpoints: [{ method: 'POST', url: 'https://pay.example.com/v1/charges', via: 'PayClient', scope: '支付' }],
    impact: '拿到安装包的人可以读到这个密钥。', limitations: '没有在设备上核对密钥是否仍然有效。',
    group: { summary: '同一个文件里还有 2 个相关常量。', families: [{ name: '支付', purpose: '创建支付请求', members: [{ role: '密钥', name: 'PAY_KEY', value: 'sk_test_…example', sensitive: true }, { role: '地址', name: 'PAY_HOST', value: 'https://pay.example.com', sensitive: false }] }] },
  },
};

export const liveCards = [
  { rule_id: 'R-003', title: '示例发现: 硬编码密钥', severity: 'critical', masvs: 'MASVS-CRYPTO-1', instance_count: 2, phases: ['P1'], instances: [
    inst('f31', 'pending', 'critical', 'com/example/wallet/util/Keys.java:17\n    static final String PAY_KEY = "…"', { credential, chain: { fix_advice: '把密钥移到服务端，客户端只拿短期令牌。' } }),
    inst('f32', 'pending', 'critical', 'com/example/wallet/util/Keys.java:18'),
  ] },
  { rule_id: 'R-001', title: '示例发现: 明文传输', severity: 'high', masvs: 'MASVS-NETWORK-1', instance_count: 2, phases: ['P2'], instances: [
    inst('f11', 'confirmed', 'high', 'com/example/wallet/net/Api.java:42\nGET http://api.example.com/v1/profile\nHTTP/1.1 200 OK', { confidence: 'high', agent_verdict: 'confirmed', agent_rationale: '请求和响应都是明文，响应里带个人资料字段。', chain: { discovery: '静态规则在 Api.java 第 42 行找到 http:// 地址。', trigger: '打开“我的”页面时发出这个请求。', http_dump: 'GET http://api.example.com/v1/profile\nHost: api.example.com', proof: '抓到的响应是明文 JSON。', fix_advice: '改用 HTTPS 并校验证书。', repro_steps: ['在测试设备上打开应用并登录测试账号', '进入“我的”页面，观察这个请求'] } }),
    inst('f12', 'confirmed', 'high', 'GET http://api.example.com/v1/orders HTTP/1.1'),
  ] },
  { rule_id: 'R-007', title: '示例发现: 匿名可访问个人资料接口', severity: 'high', masvs: 'MASVS-AUTH-1', instance_count: 2, phases: ['P2'], instances: [
    inst('f71', 'pending', 'high', 'GET /api/v1/profile HTTP/1.1\n→ 200，未带登录凭据', { confidence: 0.6, agent_verdict: 'needs_context' }),
    inst('f72', 'pending', 'high', 'GET /api/v1/profile/avatar HTTP/1.1\n→ 200'),
  ] },
  { rule_id: 'R-004', title: '示例发现: 可导出组件未设权限', severity: 'medium', masvs: 'MASVS-PLATFORM-1', instance_count: 3, phases: ['P1'], instances: [
    inst('f41', 'confirmed', 'medium', 'AndroidManifest.xml:88 exported=true', { confidence: 'medium' }),
    inst('f42', 'confirmed', 'medium', 'AndroidManifest.xml:102 exported=true'),
    inst('f43', 'excluded', 'medium', 'AndroidManifest.xml:120 exported=true'),
  ] },
  { rule_id: 'R-002', title: '示例发现: 调试标志开启', severity: 'medium', masvs: 'MASVS-RESILIENCE-2', instance_count: 1, phases: ['P1'], instances: [
    inst('f21', 'pending', 'medium', 'AndroidManifest.xml:12 android:debuggable="true"'),
  ] },
  { rule_id: 'R-006', title: '示例发现: 备份未关闭', severity: 'low', masvs: 'MASVS-STORAGE-1', instance_count: 1, phases: ['P1'], instances: [
    inst('f61', 'pending', 'low', 'allowBackup=true', { confidence: 'low' }),
  ] },
  { rule_id: 'R-005', title: '示例发现: 日志输出敏感字段，标题特意写得很长，用来检查表格和详情在窄宽度下的截断与换行', severity: 'low', masvs: 'MASVS-STORAGE-2', instance_count: 1, phases: [], instances: [
    inst('f51', 'excluded', 'low', ''),
  ] },
  { rule_id: 'R-008', title: '示例发现: 第三方库版本提示', severity: 'info', instance_count: 1, phases: ['P1'], instances: [inst('f81', 'pending', 'info', '')] },
];

export const shadowCards = [
  { rule_id: 'R-001', title: '示例发现: 明文传输', severity: 'high', masvs: 'MASVS-NETWORK-1', instance_count: 1, instances: [inst('s11', 'pending', 'high', 'GET http://api.example.com/v1/profile')] },
  { rule_id: 'S-101', title: '示例发现: 证书校验被关闭', severity: 'high', masvs: 'MASVS-NETWORK-2', instance_count: 1, instances: [inst('s21', 'pending', 'high', 'com/example/wallet/net/TrustAll.java:9')] },
  { rule_id: 'S-102', title: '示例发现: WebView 调试开启', severity: 'medium', masvs: 'MASVS-PLATFORM-2', instance_count: 1, instances: [inst('s31', 'pending', 'medium', 'com/example/wallet/web/WebHost.java:27')] },
];

/** The two cards the earlier fixtures answered; the trace checks are written against them. */
export const baseCards = [
  { rule_id: 'R-001', title: '示例发现: 明文传输', severity: 'high', masvs: 'MASVS-NETWORK-1', instance_count: 2, states: { confirmed: 2 }, instances: [{ id: 'f1', state: 'confirmed', severity: 'high', evidence: 'GET http://…' }, { id: 'f2', state: 'confirmed', severity: 'high' }] },
  { rule_id: 'R-002', title: '示例发现: 调试标志开启', severity: 'medium', instance_count: 1, states: { candidate: 1 }, instances: [{ id: 'f3', state: 'candidate', severity: 'medium' }] },
];

/** Relation graph of the running session: 50 raw nodes (12 of them finding instances), 45 after folding. */
export function liveGraph() {
  const nodes = []; const edges = [];
  const add = (id, type, label, meta = {}, more = {}) => { nodes.push({ id, type, label, meta, ...more }); return id; };
  const link = (from, to, relation) => edges.push({ from, to, relation });
  const app = add('app:wallet', 'app', 'Wallet', { package: 'com.example.wallet', version: '1.1.0' });
  const comps = ['MainActivity', 'LoginActivity', 'PayActivity', 'OrderListActivity', 'ProfileActivity', 'WebHostActivity', 'SyncService', 'PushReceiver', 'FileProvider']
    .map((n, i) => add(`comp:${n}`, 'component', n, { module: 'com.example.wallet', state: i === 5 || i === 7 ? 'exported' : 'internal' }));
  comps.forEach((c) => link(app, c, 'declares'));
  const links = ['wallet://pay', 'wallet://orders/{id}', 'https://m.example.com/invite'].map((u, i) => add(`deeplink:${i}`, 'deeplink', u, { host: i === 2 ? 'm.example.com' : 'wallet' }));
  link(comps[2], links[0], 'handles'); link(comps[3], links[1], 'handles'); link(comps[5], links[2], 'handles');
  const groups = [['账户', 'api.example.com'], ['订单', 'api.example.com'], ['支付', 'pay.example.com']].map(([n, host]) => add(`group:${n}`, 'api_group', n, { host }));
  const apis = [
    ['POST', '/api/v1/login', 0], ['GET', '/api/v1/profile', 0], ['PUT', '/api/v1/profile/avatar', 0], ['POST', '/api/v1/logout', 0], ['GET', '/api/v1/devices', 0],
    ['GET', '/api/v1/orders', 1], ['GET', '/api/v1/orders/{id}', 1], ['POST', '/api/v1/orders', 1], ['DELETE', '/api/v1/orders/{id}', 1], ['GET', '/api/v1/orders/export', 1],
    ['POST', '/v1/charges', 2], ['GET', '/v1/charges/{id}', 2], ['POST', '/v1/refunds', 2], ['GET', '/v1/methods', 2],
  ].map(([m, path, g]) => { const id = add(`api:${m} ${path}`, 'api', `${m} ${path}`, { host: g === 2 ? 'pay.example.com' : 'api.example.com' }); link(groups[g], id, 'contains'); return id; });
  link(comps[1], apis[0], 'calls'); link(comps[4], apis[1], 'calls'); link(comps[4], apis[2], 'calls'); link(comps[3], apis[5], 'calls'); link(comps[3], apis[6], 'calls');
  link(comps[2], apis[10], 'calls'); link(comps[2], apis[12], 'calls'); link(comps[6], apis[5], 'calls'); link(comps[0], apis[4], 'calls');
  const keys = [['PAY_KEY', 'Keys.java'], ['PAY_HOST', 'Keys.java'], ['MAP_SDK_KEY', 'strings.xml'], ['STAGING_HOST', 'Env.java'], ['debuggable', 'AndroidManifest.xml'], ['allowBackup', 'AndroidManifest.xml']]
    .map(([n, asset]) => add(`key:${n}`, 'key', n, { asset }));
  link(keys[0], apis[10], 'used_by'); link(keys[1], apis[10], 'used_by'); link(app, keys[4], 'declares'); link(app, keys[5], 'declares');
  // Finding instances: several nodes per rule, folded into one node per finding by the workbench.
  const fi = (id, rule, title, severity, state, from, relation) => { add(`vuln:${id}`, 'finding', title, { rule_id: rule }, { severity, state }); link(from, `vuln:${id}`, relation); };
  fi('f31', 'R-003', '示例发现: 硬编码密钥', 'critical', 'pending', keys[0], 'evidence_of'); fi('f32', 'R-003', '示例发现: 硬编码密钥', 'critical', 'pending', keys[1], 'evidence_of');
  fi('f11', 'R-001', '示例发现: 明文传输', 'high', 'confirmed', apis[1], 'observed_on'); fi('f12', 'R-001', '示例发现: 明文传输', 'high', 'confirmed', apis[5], 'observed_on');
  fi('f71', 'R-007', '示例发现: 匿名可访问个人资料接口', 'high', 'pending', apis[1], 'observed_on'); fi('f72', 'R-007', '示例发现: 匿名可访问个人资料接口', 'high', 'pending', apis[2], 'observed_on');
  fi('f41', 'R-004', '示例发现: 可导出组件未设权限', 'medium', 'confirmed', comps[5], 'observed_on'); fi('f42', 'R-004', '示例发现: 可导出组件未设权限', 'medium', 'confirmed', comps[7], 'observed_on');
  fi('f43', 'R-004', '示例发现: 可导出组件未设权限', 'medium', 'excluded', comps[8], 'observed_on');
  fi('f21', 'R-002', '示例发现: 调试标志开启', 'medium', 'pending', keys[4], 'evidence_of'); fi('f61', 'R-006', '示例发现: 备份未关闭', 'low', 'pending', keys[5], 'evidence_of');
  fi('f51', 'R-005', '示例发现: 日志输出敏感字段，标题特意写得很长，用来检查表格和详情在窄宽度下的截断与换行', 'low', 'excluded', comps[6], 'observed_on');
  const ap1 = add('approval:ap-1', 'approval', '在测试设备上重放请求', {}, { state: 'pending' }); link(ap1, apis[6], 'requests');
  const ap2 = add('approval:ap-2', 'approval', '启动导出组件', {}, { state: 'pending' }); link(ap2, comps[5], 'requests');
  return { status: 'ok', nodes, edges, total_events: 134 };
}

export const liveFacts = {
  summary: { ready: 2 },
  graph: {
    facts: {
      'F-1': { id: 'F-1', kind: 'endpoint', text: 'GET /api/v1/orders/{id} 在登录态返回 200。' },
      'F-2': { id: 'F-2', kind: 'endpoint', text: 'GET /api/v1/profile 未带登录凭据也返回 200。' },
      'F-3': { id: 'F-3', kind: 'config', text: '清单里 android:debuggable 为 true。' },
    },
    intents: {
      'I-1': { id: 'I-1', status: 'ready', text: '用第二个测试账号读取 /api/v1/orders/{id}，核对是否返回他人订单。' },
      'I-2': { id: 'I-2', status: 'ready', text: '不带登录凭据读取 /api/v1/profile/avatar。' },
      'I-3': { id: 'I-3', status: 'done', text: '核对 /api/v1/login 的签名要求。' },
    },
  },
};

export const liveCredentials = { source: 'report csv', total: 5, items: [
  { category: 'A.真实凭据', name: 'PAY_KEY', value: 'sk_test_…example', location: 'com/example/wallet/util/Keys.java:17', purpose: '第三方支付', risk: '高', fix: '改为服务端下发短期令牌' },
  { category: 'B.SDK标识/许可证', name: 'MAP_SDK_KEY', value: 'AIza…example', location: 'res/values/strings.xml', purpose: '地图 SDK', risk: '中', fix: '在服务商控制台限制包名' },
  { category: 'D.内网/环境配置', name: 'STAGING_HOST', value: 'https://staging.example.com', location: 'com/example/wallet/net/Env.java:18', purpose: '预发环境', risk: '低', fix: '发布包移除预发地址' },
  { category: 'D.内网/环境配置', name: 'PAY_HOST', value: 'https://pay.example.com', location: 'com/example/wallet/util/Keys.java:18', purpose: '支付网关地址', risk: '低', fix: '' },
  { category: 'F.已排除误报', name: 'SAMPLE_TOKEN', value: 'example-token', location: 'assets/sample.json', purpose: '示例数据', risk: '无', fix: '' },
] };
