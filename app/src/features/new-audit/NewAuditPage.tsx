import React, { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/services/api';
import { toast } from '@/components/ui';
import { UniversalImportModal } from '@/components/ui';
import { downloadJson } from '@/features/reports/reportIo';
import type { StepperPhase } from '@/components/ui/PipelineStepper';
import { AssetSection, ScopeModeSection, DeviceSection, PROFILES, MODES, SCOPE_ITEMS } from './NewAuditSections';
import type { Channel, BatchItem, PoolRow } from './NewAuditSections';
import { ParseBoard, LaunchDock } from './NewAuditDock';
import type { RecItem } from './NewAuditDock';

/** 新建安全审计任务(/v2/#/new-audit)— 左7右5 全高双栏一屏闭环:
 *  左栏三模块全展开(① 资产获取 → ② 审计范围与模式 → ③ 目标设备调度,无向导分步按钮),
 *  顶部为实时就绪状态指示条(资产/策略/设备 按完成度点亮);右栏吸顶两舱
 *  (上: APK 即时解析看板 = 预检真值;下: 执行蓝图与一键启动底座)。
 *  纪律: 壳信息仅展示,严禁写进 authorized(后端 dyn_cap 派生风险);authorized=用户勾选确认。
 *  数据流全部为既有真值端点: /api/upload/preview、/api/upload、/api/search、/api/apk/download(+status)、
 *  /api/apk/pool-state、/api/tasks、/api/batch/scan-dir、/api/tasks/batch、/api/pentest/devices、/api/tasks。
 *  设备环境自愈按钮只触发既有端点(/api/pentest/devices 快照+探测);任务阶段无独立 Frida 拉起端点,
 *  Toast 如实回报,不假调用。 */

const PREFILL_KEY = 'pentest_wizard_prefill';
// 资产输入即时正则校验——本平台目标资产=APK/XAPK 等安装包文件(三端格式,后端上传白名单同源);
// 校验器为纯函数,输入变化即时推导行内错误,非法值阻断动作按钮,修正后即时恢复。
const APK_FILE_RE = /\.(apk|xapk|hap|app|ipa)$/i;
const ABS_PATH_RE = /^\/[^<>:"|?*\u0000-\u001f]*$/;
// Web 目标多模正则校验(URL/IP/CIDR)——作为可选的 Web 授权范围随 prefill 写入渗透会话编排上下文
// (真消费链: NewProjectWizard 合并进 user_prompt 落库)。
const WEB_TARGET_RE = {
 url: /^(https?:\/\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])*)+)(:\d{1,5})?(\/\S*)?$/,
 cidr: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(\/(?:[0-9]|[1-2][0-9]|3[0-2]))$/,
 ip: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(:\d{1,5})?$/,
};
const validateWebTarget = (v: string): string => {
 const t = v.trim();
 if (!t) return ''; // 可选字段: 空值合法
 // IP/CIDR 形态先行严格判定(四段点分形态不落入 URL 宽松分支,防 192.168.1.1/40 被当域名放行)
 if (/^(?:\d{1,3}\.){3}\d{1,3}(?:\/|:|$)/.test(t)) {
 const octets = t.split(/[:/]/)[0].split('.').map(Number);
 if (!octets.every((o) => o >= 0 && o <= 255)) return 'IP 八位组越界(0-255),请检查目标格式';
 const m = t.match(/\/(\d+)$/);
 if (m && Number(m[1]) > 32) return 'CIDR 前缀越界(0-32),请检查掩码';
 if (WEB_TARGET_RE.ip.test(t) || WEB_TARGET_RE.cidr.test(t)) return '';
 return '请输入合法的 IP 或 CIDR 格式 (如 192.168.1.1、10.0.0.0/24)';
 }
 if (WEB_TARGET_RE.url.test(t)) return '';
 return '请输入合法的目标格式 (如: https://target.com、192.168.1.1 或 10.0.0.0/24)';
};
const validateApkPath = (v: string): string => {
  const t = v.trim();
  if (!t) return '资产路径不能为空';
  if (!ABS_PATH_RE.test(t)) return '请输入合法的服务器绝对路径(以 / 开头,不含 <>:"|?* 等非法字符)';
 if (!APK_FILE_RE.test(t)) return '仅支持 APK/XAPK/HAP/APP/IPA 安装包路径(以 .apk/.xapk/.hap/.app/.ipa 结尾)';
 return '';
};
const validateBatchDir = (v: string): string => {
  const t = v.trim();
  if (!t) return '目录路径不能为空';
  if (!ABS_PATH_RE.test(t)) return '请输入合法的目录绝对路径(以 / 开头,不含 <>:"|?* 等非法字符)';
  return '';
};
// 渠道来源标识(候选 source 键=apk_fetch 源注册名,标签如实映射)
const SRC_LABELS: Record<string, string> = { appchina: '应用汇', wandoujia: '豌豆荚', myapp: '应用宝', vivo: 'Vivo' };
const STATIC_MODE = '纯静态优先';

export const NewAuditPage: React.FC = () => {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // ① 资产获取
  const [channel, setChannel] = useState<Channel>('upload');
  const [apkPath, setApkPath] = useState('');            // 预检通过的资产路径(提交用)
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dragActive, setDragActive] = useState(false);   // 拖入态(光栅扫描线动效触发之一)
  const [authorized, setAuthorized] = useState(false);   // 授权确认勾选(替代硬编码 authorized 文本)
  // 在线搜索(降级契约保留)
  const [appName, setAppName] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [degraded, setDegraded] = useState(false);
  // 在线下载(POST /api/apk/download 缺省走最快通道竞速)+渠道筛选;dlIdx=进行中行(单次单条)
  const [dlIdx, setDlIdx] = useState<number | null>(null);
  const [srcFilter, setSrcFilter] = useState<string>('all');
  const [searchPage, setSearchPage] = useState(1);
  // 审计池状态(已缓存 APK=「已下载✓」徽章防重复下载; .part 字节=下载进度百分比)
  const [pool, setPool] = useState<{ cached: any[]; parts: any[] }>({ cached: [], parts: [] });
 const poolPkgTag = (pkg: string) => pkg.replace(/[^\w.-]/g, '_'); // 与 apk_fetch pkg_tag 同一净化规则
 const cachedFor = (r: any) => (r?.package ? pool.cached.find((c: any) => c.pkg === poolPkgTag(r.package)) : null);
 const partFor = (r: any) => (r?.package ? pool.parts.find((p: any) => p.tag === poolPkgTag(r.package)) : null);
 const refreshPool = async () => {
    try { setPool(await api<any>('/api/apk/pool-state')); } catch { /* 池状态读取失败不阻塞搜索主链 */ }
  };
  //  历史样本库样本选择器: /api/apk/pool-state 缓存清单 × 任务列表(#ID 联查),按包名/路径/#ID 模糊搜索,
  // 命中直接 runPreview(缓存路径),防同名包重传(零新端点)
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolQ, setPoolQ] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
 const poolTotal = pool?.cached?.length ?? 0;
 const poolRows: PoolRow[] = useMemo(() => {
    const byPath = new Map<string, any>();
 (tasks || []).forEach((t: any) => { if (t?.apk_path) byPath.set(t.apk_path, t); });
 return (pool?.cached || []).map((c: any) => {
 const t = byPath.get(c.path);
 return { key: `${c.pkg}|${c.path || ''}`, pkg: c.pkg, path: c.path || '', size: c.size || 0, taskId: t?.id, appName: t?.app_name };
 }).filter((c) => {
 const kw = poolQ.trim().toLowerCase();
 return !kw || `${c.pkg} ${c.path} #${c.taskId ?? ''} ${c.appName || ''}`.toLowerCase().includes(kw);
 }).slice(0, 30);
 }, [pool, tasks, poolQ]);
 const loadPoolTasks = () => {
    api<any[]>('/api/tasks?limit=200').then((rows) => setTasks(Array.isArray(rows) ? rows : [])).catch(() => { /* 任务列表读取失败不阻塞池面板 */ });
 };
 const togglePool = () => {
 const next = !poolOpen;
 setPoolOpen(next);
 if (next) { refreshPool(); loadPoolTasks(); }
 };
 const reusePoolRow = async (c: PoolRow) => {
 setStatus(`已挂载缓存样本: ${c.path}(${c.size ? `${(c.size / 1048576).toFixed(1)}MB` : '未知体积'})`);
 toast.info('已挂载历史样本 — 直接使用审计池缓存,不重复上传/下载');
 await runPreview(c.path);
 };
 // 审计配置模板 导出/导入(JSON,前端 localStorage+文件;零后端)
 const TPL_KEY = 'apksec-audit-config-template';
 const [tplOpen, setTplOpen] = useState(false);
 const exportTpl = () => downloadJson('audit_config_template', {
 kind: 'apksec_audit_config_template', exported_at: new Date().toISOString(),
 config: { scope, mode, baseline, rate_limit: rateLimit, web_target: webTarget, user_prompt: userPrompt, device },
 });
 const applyTpl = (cfg: any) => {
 if (Array.isArray(cfg.scope)) setScope(cfg.scope.filter((s: unknown) => typeof s === 'string'));
    if (typeof cfg.mode === 'string' && MODES.includes(cfg.mode)) setMode(cfg.mode);
    if (typeof cfg.baseline === 'string') setBaseline(cfg.baseline);
    if (Number.isFinite(Number(cfg.rate_limit))) setRateLimit(Math.max(5, Math.min(100, Number(cfg.rate_limit))));
    if (typeof cfg.web_target === 'string') setWebTarget(cfg.web_target);
    if (typeof cfg.user_prompt === 'string') setUserPrompt(cfg.user_prompt.slice(0, 2000));
    if (typeof cfg.device === 'string') setDevice(cfg.device);
    try { localStorage.setItem(TPL_KEY, JSON.stringify(cfg)); } catch { /* 配额静默 */ }
    setTplOpen(false);
    setStatus('审计配置模板已应用(策略预选已更新;localStorage 留档,下次可直接复用)');
  };
  // 批量目录(既有能力原样保留)
  const [batchDir, setBatchDir] = useState('');
  const [batchList, setBatchList] = useState<any[]>([]);
  // ③ 设备池
  const [devices, setDevices] = useState<any[]>([]);
  const [device, setDevice] = useState('');
  // 设备清单读取失败的诚实区分(403=权限边界 / 其他=探测失败),不与「0 台在线」混显
  const [devErr, setDevErr] = useState('');
  const [devBusy, setDevBusy] = useState(false);
  const [wrapFixMsg, setWrapFixMsg] = useState('');
  // ② 范围与模式预选
  const [scope, setScope] = useState<string[]>(SCOPE_ITEMS);
  const [mode, setMode] = useState(MODES[0]);
  // 给 AI 的提示词(可选)——随 prefill 带入渗透会话向导,创建会话时写 user_prompt
  const [userPrompt, setUserPrompt] = useState('');
  // Web 目标(可选,URL/IP/CIDR)+ 合规基线 + 请求速率——经 prefill 真链路进会话编排上下文
  const [webTarget, setWebTarget] = useState('');
  const [baseline, setBaseline] = useState('MASVS-v2 全量');
  const [rateLimit, setRateLimit] = useState(20);
  const [createdId, setCreatedId] = useState<number | null>(null);

 const runPreview = async (p: string) => {
    // 预检端点三端覆盖(.apk/.hap/.app/.ipa,detector 单一事实源)
    setPreview(null); setPreviewing(true); setStatus('静态预检中…');
    try {
      const d = await api<any>('/api/upload/preview', { method: 'POST', body: JSON.stringify({ apk_path: p }) });
 setPreview(d); setApkPath(d.apk_path || p);
 setStatus(d.meta ? '预检完成' : `预检部分降级: ${d.meta_error || 'manifest 解析失败'}`);
 } catch (e: any) { setPreview(null); setStatus('预检失败: ' + e.message); }
 setPreviewing(false);
 };
 // 上传格式守卫 choke point——非安装包后缀即刻 toast 拒收,不发往网关;上传中状态行呈现真实
 // 文件名+体积真值;SHA256/包名由后端 /api/upload/preview 真算回填,前端零假计算。
 const uploadFile = async (f: File) => {
    if (!APK_FILE_RE.test(f.name)) { toast.err('仅支持 APK/XAPK/HAP/APP/IPA 格式安装包'); return; }
    setBusy(true); setStatus(`上传中: ${f.name}(${(f.size / 1048576).toFixed(2)}MB)…`);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
      const d = await r.json();
      if (!r.ok || !d.apk_path) throw new Error(d.detail || '上传失败');
      await runPreview(d.apk_path);
    } catch (e: any) { setStatus('上传失败: ' + e.message); }
    setBusy(false);
  };
  // 批量上传队列: 多选/多拖→逐个上传(既有 /api/upload 真值)→清单呈现→批量授权勾选后
  // 逐个 POST /api/tasks 建任务(既有单建语义 ×N,零新端点);单文件仍走原预检看板流
  const [batchUp, setBatchUp] = useState<BatchItem[] | null>(null);
 const [batchAuthorized, setBatchAuthorized] = useState(false);
 const [batchCreating, setBatchCreating] = useState(false);
 const uploadMany = async (files: File[]) => {
 const okFiles = files.filter((f) => APK_FILE_RE.test(f.name));
 const bad = files.length - okFiles.length;
 if (bad > 0) toast.err(`${bad} 个非安装包文件已跳过(仅 APK/XAPK/HAP/APP/IPA)`);
 if (!okFiles.length) return;
 setBatchAuthorized(false);
 const items: BatchItem[] = okFiles.map((f) => ({ name: f.name, size: f.size, status: 'uploading' }));
    setBatchUp(items);
    setStatus(`批量上传中: ${okFiles.length} 个文件…`);
    for (let i = 0; i < okFiles.length; i++) {
 try {
 const fd = new FormData(); fd.append('file', okFiles[i]);
 const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
 const d = await r.json();
 if (!r.ok || !d.apk_path) throw new Error(d.detail || '上传失败');
 items[i] = { ...items[i], status: 'done', apkPath: d.apk_path };
 } catch (e: any) {
 items[i] = { ...items[i], status: 'failed', err: e.message };
 }
 setBatchUp([...items]); // 本地数组驱动(规避 state 闭包陈旧),逐项刷新清单真值
 }
 const okN = items.filter((it) => it.status === 'done').length;
 const failN = items.length - okN;
 setStatus(`批量上传完成: 成功 ${okN}${failN ? ` · 失败 ${failN}` : ''} — 勾选批量授权后可一键创建审计任务`);
 };
 const batchCreate = async () => {
 const paths = (batchUp || []).filter((it) => it.status === 'done' && it.apkPath);
    if (!paths.length || !batchAuthorized) return;
    setBatchCreating(true);
    let ok = 0, fail = 0;
    try {
      for (const it of paths) {
        try {
          await api('/api/tasks', { method: 'POST', body: JSON.stringify({ kind: 'audit', app_name: it.name.replace(/\.(apk|xapk)$/i, ''), apk_path: it.apkPath, authorized: '用户已确认测试授权(向导批量勾选)' }) });
          ok++;
        } catch { fail++; }
      }
      setStatus(`批量创建完成: 成功 ${ok}${fail ? ` · 失败 ${fail}` : ''} — 任务中心查看进度`);
      toast.ok(`批量创建 ${ok} 个审计任务`);
    } finally { setBatchCreating(false); }
  };
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
 const fs = Array.from(e.target.files || []);
 if (!fs.length) return;
 if (fs.length > 1) uploadMany(fs); else uploadFile(fs[0]);
 };
 // 拖入上传(与点击选择共用 uploadFile;拖入即触发热区光栅扫描线动效)
 const onDrop = (e: React.DragEvent) => {
 e.preventDefault(); setDragActive(false);
 const fs = Array.from(e.dataTransfer.files || []);
 if (!fs.length) return;
 if (fs.length > 1) uploadMany(fs); else uploadFile(fs[0]);
 };
 const doSearch = async () => {
    if (!appName.trim()) return;
    setSearching(true); setResults([]); setDegraded(false); setSrcFilter('all');
    try {
      const d = await api<any>(`/api/search?name=${encodeURIComponent(appName)}`);
 setResults(Array.isArray(d) ? d : (d?.candidates || []));
 setDegraded(!!d?.degraded); // 契约: degraded=true=容器镜像缺失降级
 refreshPool(); // 渲染「已下载✓」徽章(池缓存清单)
 } catch { setResults([]); }
 setSearching(false);
 };
 // 下载体验: 点击后 body 只带 name(source 缺省=后端四源 ThreadPoolExecutor 竞速自动选最快通道);
 // Toast 按真实进度呈现(起「正在通过最快渠道下载…」/ 成「下载完成,已自动预检」),胜者源+各源耗时
 // 随 Toast 如实呈现,不伪造进度条;完成后 apk_path 直通既有 /api/upload/preview 填充右栏看板。
 // 已下载缓存复用——不重下,直接对池内缓存路径跑预检(与下载完成后的自动预检同链)。
 const doDownload = async (r: any, i: number) => {
    if (dlIdx !== null) return;
    const label = r?.name || String(r);
    setDlIdx(i); setStatus(`正在通过最快渠道下载: ${label}(四源竞速)…`);
    toast.info('正在通过最快渠道下载…');
    try {
      // ① 发起异步下载 → 后端立即返回 {ok, job_id, status:"started"}
      const start = await api<any>('/api/apk/download', { method: 'POST', body: JSON.stringify({ name: label }) });
      if (!start?.ok) throw new Error(start?.detail || '下载启动失败');
      // ② 轮询 status 直到完成(3s 间隔,最多 120 次 = 6 分钟);同步刷新池状态供进度百分比
      let result: any = null;
      for (let poll = 0; poll < 120; poll++) {
 await new Promise((res) => setTimeout(res, 3000));
        refreshPool();
        const st = await api<any>('/api/apk/download/status');
 const jobs = st?.jobs || [];
 const mine = jobs.find((j: any) => j.name === label && j.status !== 'running');
 if (mine) { result = mine; break; }
 }
 if (!result) throw new Error('下载轮询超时(6 分钟)');
 if (result.status !== 'ok') throw new Error(result.result?.detail || '下载失败');
 const apkPath_ = result.result?.apk_path;
 if (!apkPath_) throw new Error('apk_path 缺失');
 refreshPool(); // 完成后行内徽章翻「已下载✓」
 const raceTxt = result.result?.race && Object.keys(result.result.race).length
 ? `最快通道 ${SRC_LABELS[result.result.source] || result.result.source} ${result.result.race_sec ?? '?'}s 胜出`
 : (result.result.cached ? '缓存命中' : '');
 toast.ok(`下载完成,已自动预检 — ${result.result.name || label}[${SRC_LABELS[result.result.source] || result.result.source}]${result.result.size_mb ? ` · ${result.result.size_mb}MB` : ''}${raceTxt ? ` · ${raceTxt}` : ''}`);
 setStatus(`下载完成: ${result.result.name || label}${raceTxt ? `(${raceTxt})` : ''}`);
 await runPreview(apkPath_);
 } catch (e: any) {
 toast.err(`在线下载失败: ${String(e?.message || e).slice(0, 90)}`);
 setStatus('在线下载失败: ' + (e?.message || e));
 }
 setDlIdx(null);
 };
 // 批量目录一键脱壳(既有能力原样保留)
 const batchUnpack = async () => {
    if (!batchList.length) return;
    if (!window.confirm(`对目录内 ${batchList.length} 个 APK 全部创建脱壳任务?`)) return;
    try {
      const d = await api<any>('/api/tasks/batch', { method: 'POST', body: JSON.stringify({ paths: batchList.map((f: any) => f.path), kind: 'unpack', authorized: '批量脱壳(自有样本目录)', ...(device ? { device_serial: device } : {}) }) });
 setStatus(`已创建 ${d.count} 个脱壳任务(任务中心查看进度与产物)`);
 } catch (e: any) { setStatus('批量脱壳创建失败: ' + e.message); }
 };
 const scanBatchDir = async () => {
    setBusy(true); setStatus('扫描目录…');
    try {
      const d = await api<any>('/api/batch/scan-dir', { method: 'POST', body: JSON.stringify({ dir: batchDir }) });
 const list = d.apks || d.files || []; // 后端键为 files,旧键 apks 兜底
 setBatchList(list);
 setStatus(list.length ? `发现 ${list.length} 个 APK(${d.dir || batchDir})` : '目录内无 APK(支持 .apk/.xapk)');
 } catch (e: any) { setBatchList([]); setStatus('扫描失败: ' + e.message); }
 setBusy(false);
 };
 // 设备池真值(/api/pentest/devices): 挂载时取真值;刷新/Frida 检测按钮复用同一既有端点
 // (快照+60s TTL 重探测,探测含 frida-server 进程真值),Toast 如实回报,零假调用。
 const fetchDevices = async (via: 'mount' | 'refresh' | 'frida') => {
    if (via !== 'mount') setDevBusy(true);
    try {
      const ds = await api<any[]>('/api/pentest/devices', {}, true);
 const list = Array.isArray(ds) ? ds : [];
 setDevices(list);
 setDevErr('');
 if (via === 'refresh') {
 setStatus(`设备刷新完成: ${list.length} 台在线`);
 toast.ok(`设备清单已刷新: ${list.length} 台在线(/api/pentest/devices 真值)`);
 } else if (via === 'frida') {
 const ready = list.filter((d: any) => d?.frida);
 if (!list.length) toast.info('无在线设备,Frida 检测未执行(静态审计不依赖设备)');
 else if (ready.length) toast.ok(`Frida 检测: ${ready.length}/${list.length} 台 frida-server 在跑(${ready.map((d: any) => d.serial).join(', ')})`);
 else toast.info(`Frida 检测: 0/${list.length} 台就绪——未探测到 frida-server 进程;任务阶段无独立拉起端点(拉起通道在渗透会话 gadget 预备),此处仅真值检测`);
 }
 } catch (e: any) {
 setDevices([]);
 setDevErr(e?.status === 403 ? '403' : (e?.message || 'error')); // 权限边界诚实降级(与 0 台在线区分)
 if (via !== 'mount') toast.err(e?.status === 403 ? '设备端点返回 403(权限边界),操作未执行' : `设备操作失败: ${e?.message || e}`);
 }
 if (via !== 'mount') setDevBusy(false);
 };
 useEffect(() => { fetchDevices('mount'); }, []);
 const fixWrap = async () => {
    if (!device) return;
    setDevBusy(true); setWrapFixMsg('适配中：检查并修复 wrap 前置环境…');
    try {
      const r = await api<any>('/api/pentest/devices/' + encodeURIComponent(device) + '/wrap-fix', { method: 'POST' });
      const checks = r?.checks || {};
      const checkTxt = Object.entries(checks).map(([k, v]) => k + '=' + (v ? '✓' : '✗')).join(' · ');
      const steps = Array.isArray(r?.manual_steps) ? r.manual_steps : [];
      setWrapFixMsg((r?.ok ? '适配完成：' : '仍需处理：') + (checkTxt || '无检查项') + (steps.length ? '；' + steps.join('；') : ''));
      if (r?.ok) toast.ok('当前设备 wrap 环境已就绪'); else toast.info('自动修复已尝试；Zygisk 等需要手动重启');
      await fetchDevices('refresh');
    } catch (e: any) {
      setWrapFixMsg('适配失败: ' + (e?.message || e));
      toast.err('设备适配失败: ' + (e?.message || e));
    } finally { setDevBusy(false); }
 };
 // 提交: 创建审计任务;authorized=用户勾选确认文本,壳信息不入 authorized;
 // Web 目标非法值边界阻断(submit 直接拒发,与启动钮置灰双闸)。
 const submit = async (gotoPentest: boolean) => {
    if (!apkPath || !authorized || webTargetErr) return;
    setBusy(true); setStatus('创建审计任务…');
    try {
      const d = await api<any>('/api/tasks', { method: 'POST', body: JSON.stringify({
 kind: 'audit',
 app_name: preview?.meta?.app_name || preview?.filename?.replace(/\.apk$/i, '') || '未命名资产',
 apk_path: apkPath,
 authorized: '用户已确认测试授权(向导勾选)',
 ...(device ? { device_serial: device } : {}), // 所选设备随任务下发(动态脱壳优先该机)
 }) });
 const tid = d?.id ?? d?.task_id ?? null;
 localStorage.setItem(PREFILL_KEY, JSON.stringify({ device, scope, mode, apk_path: apkPath, task_id: tid, user_prompt: userPrompt.trim(), web_target: webTarget.trim(), baseline, rate_limit: rateLimit, ts: Date.now() }));
 setCreatedId(tid);
 setStatus(`审计任务 #${tid ?? '?'} 已创建;设备/范围/模式预选已写入向导 prefill`);
 setTimeout(() => {
 window.location.hash = gotoPentest ? '/pentest' : `/tasks?focus=${tid ?? ''}`;
 }, 900);
 } catch (e: any) { setStatus('创建失败: ' + e.message); }
 setBusy(false);
 };

 // 输入校验即时推导(值变即算,修正后错误即时销毁,无 stale 态)
 const pathErr = channel === 'path' ? validateApkPath(apkPath) : '';
 const batchErr = channel === 'batch' ? validateBatchDir(batchDir) : '';
 const webTargetErr = validateWebTarget(webTarget);
 const meta = preview?.meta || null;
 const comp = meta?.components || {};
 // 推荐测试模块——仅对预检真值可判定项打「推荐」标记(导出组件>0),其余默认纳入不假造理由
 const exportedTotal: number | null = meta
 ? (['activity', 'service', 'receiver', 'provider'] as const).reduce((s, t) => s + (comp[t]?.exported ?? 0), 0)
 : null;
 const recs: RecItem[] = [
 { name: '组件暴露面分析', rec: exportedTotal != null && exportedTotal > 0, basis: exportedTotal != null ? `导出组件 ${exportedTotal} 个(预检真值)` : '预检元数据缺失,无判定依据' },
 { name: '敏感信息与硬编码扫描', rec: false, basis: '预检不含代码扫描数据,无判定依据' },
 { name: '网络通信分析', rec: false, basis: '预检不含权限清单/流量数据,无判定依据' },
 { name: 'WebView 配置分析', rec: false, basis: '预检不含代码扫描数据,无判定依据' },
 ];
 const applyRecs = () => {
 const recNames = recs.filter((r) => r.rec).map((r) => r.name);
 if (!recNames.length) { toast.info('预检无可判定推荐项(导出组件为 0 或元数据缺失),保持默认全纳入'); return; }
 setScope(recNames);
 toast.ok(`已应用 ${recNames.length} 个推荐模块: ${recNames.join('、')}`);
 setStatus(`已按预检推荐更新模块勾选: ${recNames.join('、')}`);
 };
 // 场景预设选中态=三项当前值恰好等于该组合(纯派生,无隐藏状态)
 const activeProfile = PROFILES.find((p) => mode === p.mode && baseline === p.baseline && rateLimit === p.rate)?.id || null;
 const applyProfile = (p: typeof PROFILES[number]) => { setMode(p.mode); setBaseline(p.baseline); setRateLimit(p.rate); };
 // 执行蓝图——静态审计任务真实执行链(预检/壳检测=本页已完成真值;其余=提交后按平台全量规则执行的待执行阶段,0/1 非假进度)
 const blueprint: StepperPhase[] = [
 { key: 'preview', name: '静态预检', done: preview ? 1 : 0, total: 1 },
 ...(preview?.strong_shell ? [{ key: 'unpack', name: '脱壳(壳时)', done: 0, total: 1 } as StepperPhase] : []),
 { key: 'decompile', name: '反编译', done: 0, total: 1 },
 { key: 'scan', name: '规则扫描', done: 0, total: 1 },
 { key: 'report', name: '报告生成', done: 0, total: 1 },
 ];
 // 就绪状态指示条(按完成度点亮;点击滚动至对应模块)
 const staticOnly = mode === STATIC_MODE;
 const assetReady = !!preview && !!apkPath && !previewing;
 const strategyReady = scope.length > 0 && !webTargetErr;
 const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const readiness = [
    { key: 'asset', no: '①', target: 'na-section-asset', label: '资产就绪', state: previewing ? 'busy' : assetReady ? 'ok' : 'todo', sub: previewing ? '预检中…' : assetReady ? '预检完成' : '待接入' },
    { key: 'strategy', no: '②', target: 'na-section-scope', label: '策略已配', state: strategyReady ? 'ok' : 'todo', sub: strategyReady ? mode : '待配置' },
    { key: 'device', no: '③', target: 'na-section-device', label: device ? '设备就绪' : staticOnly ? '静态免设备' : '设备待选', state: device ? 'ok' : staticOnly ? 'static' : 'todo', sub: device || (staticOnly ? '无需真机' : '可选挂载') },
  ];

  return (
    <div className="p-4 lg:p-5 space-y-5 h-full overflow-auto">
      {/* 页头: 标题 + 实时就绪状态指示条(① 资产就绪 → ② 策略已配 → ③ 设备就绪,按完成度点亮) */}
      <header className="space-y-2.5">
        <div className="flex items-end gap-3 flex-wrap">
          <h2 className="text-title md:text-title font-semibold text-jz-ink">新建安全审计任务</h2>
          <p className="text-body text-jz-muted">多源 APK 样本接入 · 静态秒级预检 · AI 自动化渗透编排</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap" data-wizard-steps data-readiness-bar>
 {readiness.map((r, i) => (
            <React.Fragment key={r.key}>
              <button onClick={() => jumpTo(r.target)} data-ready-item={r.key} data-ready-state={r.state}
 title="点击定位到对应模块"
 className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-pill border text-body transition-colors
 ${r.state === 'ok' ? 'bg-jz-teal/10 text-jz-teal border-jz-teal/40'
 : r.state === 'static' ? 'bg-jz-brand/10 text-jz-brand border-jz-brand/40'
 : r.state === 'busy' ? 'bg-jz-brand/10 text-jz-brand border-jz-brand/50'
 : 'text-jz-muted border-jz-border hover:border-jz-brand/30'}`}>
                <span className="w-[18px] h-[18px] rounded-pill border border-current grid place-items-center text-meta font-mono flex-none">
                  {r.state === 'ok' ? '✓' : r.no}
                </span>
                {r.label}
                <span className={`text-meta max-w-[140px] truncate ${r.state === 'ok' ? 'text-jz-teal/80' : 'opacity-70'}`}>· {r.sub}</span>
              </button>
              {i < readiness.length - 1 && <span className="w-5 h-px bg-jz-border" aria-hidden />}
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ─── 双栏主体: 左 7(三模块全展开) / 右 5(吸顶两舱,一屏闭环) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左栏: ① 资产获取 → ② 审计范围与模式 → ③ 目标设备调度(无分步按钮,全展开) */}
        <div className="lg:col-span-7 space-y-6">
          <AssetSection
 channel={channel} setChannel={setChannel}
 busy={busy} previewing={previewing}
 dragActive={dragActive} setDragActive={setDragActive}
 onDrop={onDrop} onUpload={onUpload}
 batchUp={batchUp} batchAuthorized={batchAuthorized} setBatchAuthorized={setBatchAuthorized}
 batchCreating={batchCreating} batchCreate={batchCreate}
 poolOpen={poolOpen} togglePool={togglePool}
 poolQ={poolQ} setPoolQ={setPoolQ}
 poolRows={poolRows} poolTotal={poolTotal}
 reusePoolRow={reusePoolRow}
 apkPath={apkPath} setApkPath={setApkPath} pathErr={pathErr} runPreview={runPreview}
 appName={appName} setAppName={setAppName}
 results={results} searching={searching} degraded={degraded}
 srcFilter={srcFilter} setSrcFilter={setSrcFilter}
 searchPage={searchPage} setSearchPage={setSearchPage}
 doSearch={doSearch} doDownload={doDownload}
 dlIdx={dlIdx} cachedFor={cachedFor} partFor={partFor}
 batchDir={batchDir} setBatchDir={setBatchDir} batchErr={batchErr}
 batchList={batchList} scanBatchDir={scanBatchDir} batchUnpack={batchUnpack}
 />
          <ScopeModeSection
 activeProfile={activeProfile} applyProfile={applyProfile}
 scope={scope} setScope={setScope}
 mode={mode} setMode={setMode}
 baseline={baseline} setBaseline={setBaseline}
 rateLimit={rateLimit} setRateLimit={setRateLimit}
 webTarget={webTarget} setWebTarget={setWebTarget} webTargetErr={webTargetErr}
 userPrompt={userPrompt} setUserPrompt={setUserPrompt}
 exportTpl={exportTpl} openTplImport={() => setTplOpen(true)}
 />
          <DeviceSection
 devices={devices} device={device} setDevice={setDevice}
 devErr={devErr} staticOnly={staticOnly}
 devBusy={devBusy}
 onRefresh={() => fetchDevices('refresh')}
 onFridaCheck={() => fetchDevices('frida')}
 wrapFixMsg={wrapFixMsg}
 onFixWrap={fixWrap}
 />
        </div>

        {/* 右栏: 吸顶两舱(上: 即时解析看板 / 下: 执行蓝图与一键启动底座) */}
        <div className="lg:col-span-5 lg:sticky lg:top-4 space-y-6">
          <ParseBoard preview={preview} previewing={previewing} recs={recs} applyRecs={applyRecs} />
          <LaunchDock
 preview={preview} apkPath={apkPath}
 mode={mode} baseline={baseline} rateLimit={rateLimit}
 device={device} staticOnly={staticOnly}
 blueprint={blueprint}
 authorized={authorized} setAuthorized={setAuthorized}
 busy={busy} webTargetErr={webTargetErr}
 submit={submit}
 status={status} createdId={createdId}
 />
        </div>
      </div>

      {/* 审计配置模板导入(前端解析 JSON,即时应用策略预选;localStorage 留档) */}
      <UniversalImportModal
 open={tplOpen}
 title="导入审计配置模板(JSON)"
 hint="字段: scope[](范围)/mode(介入级别)/baseline(基线)/rate_limit/web_target/user_prompt/device——导入即时应用到「审计范围与模式」并 localStorage 留档"
 onClose={() => setTplOpen(false)}
 validateRow={() => ''}
 onImportSuccess={(r) => { applyTpl(r.rows[0]?.config || r.rows[0] || {}); }}
 />
    </div>
  );
};

export default NewAuditPage;
